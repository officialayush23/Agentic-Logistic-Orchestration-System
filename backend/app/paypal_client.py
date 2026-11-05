"""PayPal REST client — the only module that talks to PayPal.

Deterministic code calls these functions; the LLM never does. Every write sends
a PayPal-Request-Id so a retried call can never move money twice.

Sandbox by default (PAYPAL_ENV=sandbox). Credentials: PAYPAL_CLIENT_ID /
PAYPAL_CLIENT_SECRET.
"""
from __future__ import annotations

import asyncio
import os
import time
import uuid
from typing import Any

import httpx

BASE = ("https://api-m.paypal.com" if os.getenv("PAYPAL_ENV", "sandbox") == "live"
        else "https://api-m.sandbox.paypal.com")
CLIENT_ID = os.getenv("PAYPAL_CLIENT_ID", "")
CLIENT_SECRET = os.getenv("PAYPAL_CLIENT_SECRET", "")


class PayPalError(RuntimeError):
    def __init__(self, status: int, body: Any, op: str):
        self.status, self.body, self.op = status, body, op
        name = body.get("name") if isinstance(body, dict) else None
        issue = None
        if isinstance(body, dict) and body.get("details"):
            issue = body["details"][0].get("issue")
        super().__init__(f"PayPal {op} failed ({status}): {issue or name or body}")


_token: str | None = None
_token_exp: float = 0.0
_lock = asyncio.Lock()


def configured() -> bool:
    return bool(CLIENT_ID and CLIENT_SECRET)


async def _access_token() -> str:
    global _token, _token_exp
    async with _lock:
        if _token and time.time() < _token_exp - 60:
            return _token
        async with httpx.AsyncClient(timeout=30) as c:
            r = await c.post(f"{BASE}/v1/oauth2/token", data={"grant_type": "client_credentials"},
                             auth=(CLIENT_ID, CLIENT_SECRET))
        if r.status_code >= 300:
            raise PayPalError(r.status_code, r.text, "oauth")
        j = r.json()
        _token, _token_exp = j["access_token"], time.time() + float(j.get("expires_in", 3000))
        return _token


async def call(method: str, path: str, body: dict | None = None, *, op: str,
               request_id: str | None = None) -> dict:
    tok = await _access_token()
    headers = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json",
               "PayPal-Request-Id": request_id or str(uuid.uuid4()), "Prefer": "return=representation"}
    async with httpx.AsyncClient(timeout=45) as c:
        r = await c.request(method, f"{BASE}{path}", json=body, headers=headers)
    try:
        data = r.json() if r.content else {}
    except ValueError:
        data = {"raw": r.text}
    if r.status_code >= 300:
        raise PayPalError(r.status_code, data, op)
    return data


# ------------------------------------------------------------- Vault (mandate)

async def create_setup_token(return_url: str, cancel_url: str) -> dict:
    return await call("POST", "/v3/vault/setup-tokens", {
        "payment_source": {"paypal": {
            "description": "DisruptionOps agent spending mandate",
            "usage_type": "MERCHANT", "customer_type": "CONSUMER", "permit_multiple_payment_tokens": True,
            "experience_context": {"brand_name": "DisruptionOps", "return_url": return_url,
                                   "cancel_url": cancel_url, "shipping_preference": "NO_SHIPPING",
                                   "vault_instruction": "ON_PAYER_APPROVAL"}}}}, op="vault.setup")


async def create_payment_token(setup_token_id: str) -> dict:
    return await call("POST", "/v3/vault/payment-tokens",
                      {"payment_source": {"token": {"id": setup_token_id, "type": "SETUP_TOKEN"}}},
                      op="vault.payment_token")


# ------------------------------------------------------ Orders / Payments

async def authorize(*, vault_id: str, amount_usd: float, reference: str, description: str,
                    request_id: str) -> dict:
    """Create an AUTHORIZE order against the mandate. Funds are held, not moved."""
    o = await call("POST", "/v2/checkout/orders", {
        "intent": "AUTHORIZE",
        "payment_source": {"paypal": {"vault_id": vault_id}},
        "purchase_units": [{
            "reference_id": reference, "custom_id": reference,
            "invoice_id": f"{reference}-{request_id[:8]}",
            "description": description[:127],
            "amount": {"currency_code": "USD", "value": f"{amount_usd:.2f}"}}]},
        op="orders.authorize", request_id=request_id)
    auth = o["purchase_units"][0]["payments"]["authorizations"][0]
    return {"order_id": o["id"], "authorization_id": auth["id"], "status": auth["status"],
            "expires_at": auth.get("expiration_time")}


async def capture(authorization_id: str, *, note: str, request_id: str) -> dict:
    return await call("POST", f"/v2/payments/authorizations/{authorization_id}/capture",
                      {"final_capture": True, "note_to_payer": note[:255]},
                      op="payments.capture", request_id=request_id)


async def void(authorization_id: str, *, request_id: str) -> dict:
    return await call("POST", f"/v2/payments/authorizations/{authorization_id}/void",
                      op="payments.void", request_id=request_id)


async def refund(capture_id: str, *, note: str, request_id: str) -> dict:
    return await call("POST", f"/v2/payments/captures/{capture_id}/refund",
                      {"note_to_payer": note[:255]}, op="payments.refund", request_id=request_id)


async def get_authorization(authorization_id: str) -> dict:
    return await call("GET", f"/v2/payments/authorizations/{authorization_id}", op="payments.get_auth")


# ---------------------------------------------------------------- Payouts

async def payout(*, receiver: str, amount_usd: float, note: str, item_id: str, request_id: str) -> dict:
    r = await call("POST", "/v1/payments/payouts", {
        "sender_batch_header": {"sender_batch_id": f"DOPS-{request_id[:20]}",
                                "email_subject": f"DisruptionOps payment · {item_id}",
                                "recipient_type": "EMAIL"},
        "items": [{"amount": {"value": f"{amount_usd:.2f}", "currency": "USD"},
                   "receiver": receiver, "note": note[:4000], "sender_item_id": item_id}]},
        op="payouts.create", request_id=request_id)
    return {"batch_id": r["batch_header"]["payout_batch_id"], "status": r["batch_header"]["batch_status"]}


# --------------------------------------------------------------- Webhooks

async def list_webhooks() -> list[dict]:
    return (await call("GET", "/v1/notifications/webhooks", op="webhooks.list")).get("webhooks", [])


async def ensure_webhook(url: str, events: list[str]) -> str:
    for w in await list_webhooks():
        if w.get("url") == url:
            return w["id"]
    w = await call("POST", "/v1/notifications/webhooks",
                   {"url": url, "event_types": [{"name": e} for e in events]}, op="webhooks.create")
    return w["id"]


async def verify_webhook(*, headers: dict[str, str], event: dict, webhook_id: str) -> bool:
    h = {k.lower(): v for k, v in headers.items()}
    body = {
        "auth_algo": h.get("paypal-auth-algo"), "cert_url": h.get("paypal-cert-url"),
        "transmission_id": h.get("paypal-transmission-id"),
        "transmission_sig": h.get("paypal-transmission-sig"),
        "transmission_time": h.get("paypal-transmission-time"),
        "webhook_id": webhook_id, "webhook_event": event,
    }
    if not all(body[k] for k in ("auth_algo", "cert_url", "transmission_id", "transmission_sig", "transmission_time")):
        return False
    r = await call("POST", "/v1/notifications/verify-webhook-signature", body, op="webhooks.verify")
    return r.get("verification_status") == "SUCCESS"


WEBHOOK_EVENTS = [
    "PAYMENT.AUTHORIZATION.CREATED", "PAYMENT.AUTHORIZATION.VOIDED",
    "PAYMENT.CAPTURE.COMPLETED", "PAYMENT.CAPTURE.DENIED", "PAYMENT.CAPTURE.REFUNDED",
    "PAYMENT.PAYOUTSBATCH.SUCCESS", "PAYMENT.PAYOUTS-ITEM.SUCCEEDED", "PAYMENT.PAYOUTS-ITEM.FAILED",
    "PAYMENT.PAYOUTS-ITEM.UNCLAIMED", "VAULT.PAYMENT-TOKEN.CREATED", "VAULT.PAYMENT-TOKEN.DELETED",
    "CHECKOUT.ORDER.APPROVED",
]
