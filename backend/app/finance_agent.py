"""The money half of the agent. Deterministic: no LLM call anywhere in this file.

    hold      — the agent places an order       → Orders v2 AUTHORIZE against the mandate
    void      — the supplier's claim is false   → void the authorization (money never moved)
    release   — goods received and QC passed    → capture (pro-rata on partial QC) + Payout to supplier
    refund    — QC fails after money moved      → refund the capture
    approve   — amount above authority limit    → hold anyway, release waits for an emailed one-time code

Every state change writes a payment_events row and an audit event, so the UI's
PayPal timeline and the agent's audit trail are the same facts.
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from . import guards, mailer, paypal_client as pp
from .core import APPROVAL_THRESHOLD_INR, broadcast_state, emit

log = logging.getLogger("disruptionops.finance")

INR_PER_USD = float(os.getenv("INR_PER_USD", "84"))
# The agent's own spending authority per order. Above it the hold still happens,
# release waits for a human code. Kept in USD because the money layer is USD.
AUTHORITY_LIMIT_USD = float(os.getenv("AUTHORITY_LIMIT_USD", "5000"))
FORWARDER_SUPPLIER = os.getenv("FORWARDER_SUPPLIER_ID", "SUP-71")
CODE_SALT = os.getenv("CREDENTIAL_ENCRYPTION_KEY", "dops")

LIVE_STATES = ("funds_held", "awaiting_approval", "funds_released", "payout_sent", "invoice_received")


def to_usd(inr: float) -> float:
    return max(1.0, round(float(inr) / INR_PER_USD, 2))


def _hash(code: str) -> str:
    return hashlib.sha256(f"{CODE_SALT}:{code}".encode()).hexdigest()


async def mandate(conn) -> dict | None:
    row = await conn.fetchrow("select * from finance_mandates where status='active'")
    return dict(row) if row else None


async def _event(conn, payment_id: int, type_: str, detail: str, *, api: str | None = None,
                 paypal_id: str | None = None, payload: dict | None = None) -> None:
    await conn.execute(
        """insert into payment_events (payment_id, type, detail, api, paypal_id, payload, org_id)
           select $1,$2,$3,$4,$5,$6::jsonb,
                  coalesce(nullif(current_setting('app.org_id', true), ''), (select org_id from payments where id=$1))""",
        payment_id, type_, detail, api, paypal_id, json.dumps(payload or {}, default=str))
    await broadcast_state("payment_event", {"payment_id": payment_id, "type": type_})


async def _set(conn, payment_id: int, **cols: Any) -> None:
    if not cols:
        return
    sets = ", ".join(f"{k} = ${i + 2}" for i, k in enumerate(cols))
    await conn.execute(f"update payments set {sets}, updated_at = now() where id = $1",
                       payment_id, *cols.values())


async def live_payment(conn, po_id: str, kind: str = "purchase") -> dict | None:
    row = await conn.fetchrow(
        "select * from payments where po_id=$1 and kind=$2 and not archived order by id desc limit 1",
        po_id, kind)
    return dict(row) if row else None


# ------------------------------------------------------------------- hold --

async def hold_for_po(conn, po_id: str, *, incident_id: str | None = None,
                      reason: str = "Purchase order placed") -> dict | None:
    """Reserve the money for a purchase order. Idempotent per PO."""
    existing = await live_payment(conn, po_id)
    if existing and existing["state"] not in ("failed", "not_started"):
        return existing

    po = await conn.fetchrow(
        """select p.*, s.name as supplier_name, c.display_name as component_name
             from purchase_orders p
             left join suppliers s on s.id = p.supplier_id
             left join components c on c.id = p.component_id
            where p.id = $1""", po_id)
    if not po:
        return None
    amount_inr = float(po["quantity"] or 0) * float(po["unit_price"] or 0)
    usd = to_usd(amount_inr)
    needs_approval = usd > AUTHORITY_LIMIT_USD

    # Buyer Shield, before any money is committed: fair price, then budget.
    po_d = dict(po)
    price = await guards.fair_price(conn, po_d, inr_per_usd=INR_PER_USD)
    await guards.record(conn, price, po_id=po_id, supplier_id=po["supplier_id"], incident_id=incident_id)
    env = await guards.budget(conn, po_d, usd)
    await guards.record(conn, env, po_id=po_id, supplier_id=po["supplier_id"], incident_id=incident_id)
    if price.outcome == "escalate" or env.outcome == "escalate":
        needs_approval = True
    if price.outcome == "block":
        if existing:
            pid = existing["id"]
        else:
            pid = await conn.fetchval(
                """insert into payments (po_id, incident_id, supplier_id, amount_usd, amount_inr, needs_approval)
                   values ($1,$2,$3,$4,$5,false) returning id""",
                po_id, incident_id, po["supplier_id"], usd, amount_inr)
        await _set(conn, pid, state="blocked", note=price.reason)
        await _event(conn, pid, "GUARD.FAIR_PRICE.BLOCKED", price.reason, api="guards.fair_price")
        return await live_payment(conn, po_id)

    if existing:
        pid = existing["id"]
    else:
        pid = await conn.fetchval(
            """insert into payments (po_id, incident_id, supplier_id, amount_usd, amount_inr, needs_approval)
               values ($1,$2,$3,$4,$5,$6) returning id""",
            po_id, incident_id, po["supplier_id"], usd, amount_inr, needs_approval)

    m = await mandate(conn)
    if not m or not pp.configured():
        why = "no PayPal spending mandate is connected" if not m else "PayPal credentials are not configured"
        await _set(conn, pid, state="not_started", note=why)
        await _event(conn, pid, "HOLD.SKIPPED", f"Could not hold funds: {why}.")
        return await live_payment(conn, po_id)

    try:
        r = await pp.authorize(vault_id=m["vault_id"], amount_usd=usd, reference=po_id,
                               description=f"{po_id} · {po['component_name'] or po['component_id']} · {po['supplier_name']}",
                               request_id=f"hold-{pid}")
    except pp.PayPalError as exc:
        await _set(conn, pid, state="failed", note=str(exc))
        await _event(conn, pid, "HOLD.FAILED", str(exc), api="POST /v2/checkout/orders")
        await emit(conn, incident_id=incident_id, actor="agent", event_type="PAYPAL_HOLD_FAILED",
                   human_summary=f"PayPal refused the hold for {po_id}: {exc}", payload={"po_id": po_id})
        return await live_payment(conn, po_id)

    state = "awaiting_approval" if needs_approval else "funds_held"
    await _set(conn, pid, state=state, paypal_order_id=r["order_id"], authorization_id=r["authorization_id"],
               expires_at=datetime.fromisoformat(r["expires_at"].replace("Z", "+00:00")) if r.get("expires_at") else None)
    await _event(conn, pid, "ORDER.CREATED", f"Order to {po['supplier_name']}, intent AUTHORIZE, against the mandate",
                 api="POST /v2/checkout/orders", paypal_id=r["order_id"])
    await _event(conn, pid, "PAYMENT.AUTHORIZATION.CREATED",
                 f"${usd:,.2f} held — reserved, not moved. {reason}.",
                 api="AUTHORIZE (vault_id)", paypal_id=r["authorization_id"])
    await emit(conn, incident_id=incident_id, actor="agent", event_type="PAYPAL_FUNDS_HELD",
               human_summary=(f"PayPal is holding ${usd:,.2f} for {po_id} ({po['supplier_name']}). "
                              "It will be released only when the goods are received and pass QC."),
               payload={"po_id": po_id, "authorization_id": r["authorization_id"], "order_id": r["order_id"],
                        "amount_usd": usd, "needs_approval": needs_approval})
    if needs_approval:
        await request_release_approval(conn, pid, reason=(
            f"${usd:,.2f} for {po_id} is above the agent's ${AUTHORITY_LIMIT_USD:,.0f} authority. "
            "The money is held; releasing it needs your code."))
    return await live_payment(conn, po_id)


async def ensure_holds_for_open_pos(conn) -> int:
    """Every open purchase order should have its money reserved. Used when a run starts."""
    rows = await conn.fetch(
        """select p.id from purchase_orders p
            where p.status in ('open','in_transit','delayed')
              and not exists (select 1 from payments x where x.po_id = p.id and not x.archived
                              and x.state <> 'failed')""")
    n = 0
    for r in rows:
        out = await hold_for_po(conn, r["id"], reason="Open purchase order at run start")
        n += 1 if out and out.get("authorization_id") else 0
    return n


# ------------------------------------------------------------ void / refund --

async def void_for_po(conn, po_id: str, *, reason: str, incident_id: str | None = None) -> dict | None:
    """The supplier's story is false or the goods are wrong. Money must not move (or must come back)."""
    p = await live_payment(conn, po_id)
    if not p or p["state"] in ("hold_voided", "refunded", "failed", "not_started"):
        return p
    try:
        if p["capture_id"]:
            r = await pp.refund(p["capture_id"], note=reason, request_id=f"refund-{p['id']}")
            await _set(conn, p["id"], state="refunded", refund_id=r.get("id"), match="mismatch", note=reason)
            await _event(conn, p["id"], "PAYMENT.CAPTURE.REFUNDED", f"${float(p['amount_usd']):,.2f} pulled back. {reason}",
                         api="POST /v2/payments/captures/{id}/refund", paypal_id=r.get("id"))
            summary = f"Refunded ${float(p['amount_usd']):,.2f} on {po_id} through PayPal. {reason}"
            etype = "PAYPAL_REFUNDED"
        elif p["authorization_id"]:
            await pp.void(p["authorization_id"], request_id=f"void-{p['id']}")
            await _set(conn, p["id"], state="hold_voided", match="mismatch", note=reason)
            await _event(conn, p["id"], "PAYMENT.AUTHORIZATION.VOIDED",
                         f"Hold voided by deterministic rule — the money never left the buyer. {reason}",
                         api="POST /v2/payments/authorizations/{id}/void", paypal_id=p["authorization_id"])
            summary = f"Voided the ${float(p['amount_usd']):,.2f} PayPal hold on {po_id}. {reason}"
            etype = "PAYPAL_HOLD_VOIDED"
        else:
            return p
    except pp.PayPalError as exc:
        await _event(conn, p["id"], "VOID.FAILED", str(exc))
        await emit(conn, incident_id=incident_id, actor="agent", event_type="PAYPAL_VOID_FAILED",
                   human_summary=f"Could not void/refund {po_id}: {exc}", payload={"po_id": po_id})
        return p
    await conn.execute("update release_approvals set state='expired' where payment_id=$1 and state='pending'", p["id"])
    await emit(conn, incident_id=incident_id or p.get("incident_id"), actor="agent", event_type=etype,
               human_summary=summary, payload={"po_id": po_id, "payment_id": p["id"], "reason": reason})
    return await live_payment(conn, po_id)


# ----------------------------------------------------------------- release --

async def on_goods_received(conn, po_id: str, *, received: int, approved: int,
                            incident_id: str | None = None, invoice_number: str | None = None,
                            delivered_at: datetime | None = None) -> dict | None:
    """Three-way match: PO ↔ supplier invoice (amount held) ↔ goods receipt. Then pay, or don't."""
    p = await live_payment(conn, po_id)
    if p and p["state"] in ("funds_released", "retention_held", "payout_sent"):
        # Already paid. A second receipt/invoice on the same PO is the classic duplicate.
        v = guards.Verdict("duplicate", "block",
                           f"{po_id} is already paid (${float(p.get('captured_usd') or p['amount_usd']):,.2f}); "
                           f"invoice {invoice_number or '(none)'} refused as a duplicate of {p.get('invoice_number') or 'the original'}.",
                           amount_usd=float(p.get("captured_usd") or p["amount_usd"]),
                           detail={"invoice": invoice_number, "original": p.get("invoice_number")})
        await guards.record(conn, v, po_id=po_id, supplier_id=p["supplier_id"], incident_id=incident_id)
        await _event(conn, p["id"], "GUARD.DUPLICATE.BLOCKED", v.reason, api="guards.duplicate")
        return p
    if not p or p["state"] in ("hold_voided", "refunded", "failed", "not_started", "blocked"):
        return p
    po = await conn.fetchrow("select quantity from purchase_orders where id=$1", po_id)
    ordered = int(po["quantity"] or 0) if po else 0
    await _event(conn, p["id"], "GOODS.RECEIVED",
                 f"Warehouse received {received}, {approved} passed QC (ordered {ordered}).",
                 api="warehouse_reply")

    if approved <= 0:
        return await void_for_po(conn, po_id, incident_id=incident_id,
                                 reason=f"QC failed: 0 of {received} units usable")

    dup = await guards.duplicate(conn, p, invoice_number=invoice_number or p.get("invoice_number"))
    await guards.record(conn, dup, po_id=po_id, supplier_id=p["supplier_id"], incident_id=incident_id)
    if dup.outcome == "block":
        await _set(conn, p["id"], state="blocked", note=dup.reason)
        await _event(conn, p["id"], "GUARD.DUPLICATE.BLOCKED", dup.reason, api="guards.duplicate")
        return await live_payment(conn, po_id)
    if invoice_number:
        await _set(conn, p["id"], invoice_number=invoice_number)

    fraction = min(1.0, approved / ordered) if ordered else 1.0
    await _set(conn, p["id"], match="matched" if fraction >= 0.999 else "mismatch")
    await _event(conn, p["id"], "MATCH.PASSED" if fraction >= 0.999 else "MATCH.PARTIAL",
                 "PO, held amount and goods receipt agree." if fraction >= 0.999
                 else f"Only {approved}/{ordered} usable — paying for {fraction:.0%}.",
                 api="finance_agent.three_way_match")

    if p["needs_approval"] and not p["approved_at"]:
        await _set(conn, p["id"], state="awaiting_approval")
        await _event(conn, p["id"], "RELEASE.WAITING", "Goods verified. Release waits for the approver's code.")
        return await live_payment(conn, po_id)
    return await _capture_and_pay(conn, p, fraction=fraction, incident_id=incident_id,
                                  approved=approved, ordered=ordered, delivered_at=delivered_at)


async def _capture_and_pay(conn, p: dict, *, fraction: float, incident_id: str | None,
                           approved: int | None = None, ordered: int | None = None,
                           delivered_at: datetime | None = None) -> dict | None:
    po_id = p["po_id"]
    po = dict(await conn.fetchrow("select * from purchase_orders where id=$1", po_id) or {})
    held = float(p["amount_usd"])
    # Quality holdback: pay for accepted units only, keep retention back.
    qv, accepted, retention = guards.quality_holdback(po, ordered or 1, approved if approved is not None else (ordered or 1), held) \
        if ordered else (guards.Verdict("quality_holdback", "pass", "n/a"), round(held * fraction, 2), 0.0)
    await guards.record(conn, qv, po_id=po_id, supplier_id=p["supplier_id"], incident_id=incident_id)
    # Late-delivery credit: the penalty comes off the capture itself.
    lv = guards.late_credit(po, accepted, delivered_at=delivered_at)
    await guards.record(conn, lv, po_id=po_id, supplier_id=p["supplier_id"], incident_id=incident_id)
    credit = lv.amount_usd if lv.outcome == "adjust" else 0.0
    # Payee lock: decide the receiver before any money moves.
    pv, payee = await guards.payee_lock(conn, p["supplier_id"])
    await guards.record(conn, pv, po_id=po_id, supplier_id=p["supplier_id"], incident_id=incident_id)
    # Early-pay optimizer: a 2/10 net 30 term is worth ~37%/yr. Paying now, inside
    # the discount window, means capturing the discounted amount.
    discount = 0.0
    take, rate = guards.early_pay(float(po.get("discount_pct") or 0) or None, po.get("discount_days"), po.get("net_days"),
                                  cost_of_capital=float(os.getenv("COST_OF_CAPITAL", "0.12")))
    if take:
        discount = round((accepted - credit) * float(po["discount_pct"]) / 100, 2)
        ev = guards.Verdict("early_pay", "adjust",
                            f"Paid inside the {po['discount_days']}-day window: {float(po['discount_pct']):g}% discount "
                            f"(${discount:,.2f}) taken, worth {rate * 100:.0f}% a year vs {float(os.getenv('COST_OF_CAPITAL', '0.12')) * 100:.0f}% cost of capital.",
                            amount_usd=discount, detail={"annualized": rate})
        await guards.record(conn, ev, po_id=po_id, supplier_id=p["supplier_id"], incident_id=incident_id)
    body_amount = round(max(0.0, accepted - credit - retention - discount), 2)
    partial = body_amount < held - 0.005
    try:
        if partial:
            cap = await pp.call("POST", f"/v2/payments/authorizations/{p['authorization_id']}/capture",
                                {"final_capture": not retention, "amount": {"currency_code": "USD", "value": f"{body_amount:.2f}"},
                                 "note_to_payer": f"{po_id}: accepted value less credits"},
                                op="payments.capture", request_id=f"capture-{p['id']}")
        else:
            cap = await pp.capture(p["authorization_id"], note=f"{po_id}: goods received and QC passed",
                                   request_id=f"capture-{p['id']}")
    except pp.PayPalError as exc:
        await _event(conn, p["id"], "CAPTURE.FAILED", str(exc))
        await emit(conn, incident_id=incident_id, actor="agent", event_type="PAYPAL_CAPTURE_FAILED",
                   human_summary=f"Capture failed for {po_id}: {exc}", payload={"po_id": po_id})
        return p
    extra = {}
    try:  # columns from migration 0012
        await _set(conn, p["id"], captured_usd=body_amount, credit_usd=credit or None, retention_usd=retention or None,
                   retention_until=(datetime.now(timezone.utc) + timedelta(days=30)) if retention else None)
    except Exception:  # noqa: BLE001
        pass
    await _set(conn, p["id"], capture_id=cap.get("id"), state="retention_held" if retention else "funds_released")
    parts = [f"${body_amount:,.2f} captured after verified goods"]
    if credit:
        parts.append(f"late credit -${credit:,.2f}")
    if discount:
        parts.append(f"early-pay discount -${discount:,.2f}")
    if retention:
        parts.append(f"retention ${retention:,.2f} still held")
    await _event(conn, p["id"], "PAYMENT.CAPTURE.COMPLETED", " · ".join(parts) + ".",
                 api="POST /v2/payments/authorizations/{id}/capture", paypal_id=cap.get("id"))

    supplier = await conn.fetchrow("select name from suppliers where id=$1", p["supplier_id"])
    if pv.outcome == "block" or not payee:
        await _event(conn, p["id"], "GUARD.PAYEE_LOCK.HELD", pv.reason, api="guards.payee_lock")
    else:
        try:
            po = await pp.payout(receiver=payee, amount_usd=body_amount,
                                 note=f"Payment for {po_id} — goods received and QC passed.", item_id=po_id,
                                 request_id=f"payout-{p['id']}")
            await _set(conn, p["id"], payout_batch_id=po["batch_id"])
            await _event(conn, p["id"], "PAYMENTS.PAYOUTSBATCH.CREATED",
                         f"${body_amount:,.2f} paid out to {supplier['name'] if supplier else p['supplier_id']} (locked payee {payee}).",
                         api="POST /v1/payments/payouts", paypal_id=po["batch_id"])
        except pp.PayPalError as exc:
            await _event(conn, p["id"], "PAYOUT.FAILED", str(exc), api="POST /v1/payments/payouts")
    await emit(conn, incident_id=incident_id or p.get("incident_id"), actor="agent", event_type="PAYPAL_FUNDS_RELEASED",
               human_summary=f"Goods verified for {po_id}. Released ${body_amount:,.2f} to {supplier['name'] if supplier else p['supplier_id']} via PayPal.",
               payload={"po_id": po_id, "capture_id": cap.get("id"), "amount_usd": body_amount})
    return await live_payment(conn, po_id)


async def expedite_fee(conn, *, incident_id: str, po_id: str, amount_usd: float) -> dict | None:
    """Pay the freight forwarder's air-expedite fee instantly (Payouts)."""
    fwd = await conn.fetchrow("select id, name, paypal_email from suppliers where id=$1", FORWARDER_SUPPLIER)
    if not fwd or not fwd["paypal_email"] or not pp.configured():
        return None
    if await live_payment(conn, po_id, kind="fee"):
        return None
    pid = await conn.fetchval(
        """insert into payments (po_id, incident_id, supplier_id, amount_usd, kind, match)
           values ($1,$2,$3,$4,'fee','matched') returning id""", po_id, incident_id, fwd["id"], amount_usd)
    try:
        r = await pp.payout(receiver=fwd["paypal_email"], amount_usd=amount_usd,
                            note=f"Air-freight expedite fee for {po_id}", item_id=f"{po_id}-fee",
                            request_id=f"fee-{pid}")
    except pp.PayPalError as exc:
        await _set(conn, pid, state="failed", note=str(exc))
        return None
    await _set(conn, pid, state="payout_sent", payout_batch_id=r["batch_id"])
    await _event(conn, pid, "PAYMENTS.PAYOUTSBATCH.CREATED", f"${amount_usd:,.2f} expedite fee to {fwd['name']}.",
                 api="POST /v1/payments/payouts", paypal_id=r["batch_id"])
    await emit(conn, incident_id=incident_id, actor="agent", event_type="PAYPAL_PAYOUT_SENT",
               human_summary=f"Paid {fwd['name']} a ${amount_usd:,.2f} air-expedite fee via PayPal Payouts.",
               payload={"po_id": po_id, "batch_id": r["batch_id"]})
    return await live_payment(conn, po_id, kind="fee")


# ---------------------------------------------------------------- approvals --

async def request_release_approval(conn, payment_id: int, *, reason: str) -> None:
    code = f"{secrets.randbelow(1_000_000):06d}"
    await conn.execute("update release_approvals set state='expired' where payment_id=$1 and state='pending'", payment_id)
    aid = await conn.fetchval(
        "insert into release_approvals (payment_id, code_hash, sent_to, reason) values ($1,$2,$3,$4) returning id",
        payment_id, _hash(code), mailer.APPROVER, reason)
    p = await conn.fetchrow(
        "select p.*, s.name as supplier_name from payments p left join suppliers s on s.id=p.supplier_id where p.id=$1",
        payment_id)
    sent = await mailer.send(
        mailer.APPROVER, f"Approval code {code} · release ${float(p['amount_usd']):,.2f} for {p['po_id']}",
        f"{reason}\n\nYour one-time code: {code}\nEnter it in DisruptionOps → Approvals. It expires in 24 hours.",
        mailer.card(f"Release ${float(p['amount_usd']):,.2f} to {p['supplier_name']}?",
                    [("Purchase order", p["po_id"]), ("Amount", f"${float(p['amount_usd']):,.2f}"),
                     ("Authority limit", f"${AUTHORITY_LIMIT_USD:,.0f}"), ("One-time code", f"<span style='font-size:20px;letter-spacing:4px'>{code}</span>")],
                    "The money is already held in PayPal. Approving lets the agent release it once the goods are verified."))
    await _event(conn, payment_id, "APPROVAL.REQUESTED",
                 f"Above the ${AUTHORITY_LIMIT_USD:,.0f} limit — code {'emailed to ' + mailer.APPROVER if sent else 'generated (email not configured)'}.",
                 api="release_approvals", payload={"approval_id": aid})
    await emit(conn, incident_id=p["incident_id"], actor="agent", event_type="APPROVAL_REQUESTED",
               human_summary=f"Releasing ${float(p['amount_usd']):,.2f} for {p['po_id']} needs a human. Code sent by email.",
               payload={"approval_id": aid, "payment_id": payment_id, "emailed": sent})
    if not sent:
        log.warning("approval %s code (email not configured): %s", aid, code)


async def decide_release(conn, approval_id: int, *, code: str | None, decision: str, by: str) -> dict:
    a = await conn.fetchrow("select * from release_approvals where id=$1", approval_id)
    if not a or a["state"] != "pending":
        return {"ok": False, "error": "This approval is no longer pending."}
    if a["expires_at"] < datetime.now(timezone.utc):
        await conn.execute("update release_approvals set state='expired' where id=$1", approval_id)
        return {"ok": False, "error": "The code has expired. A new one has been requested."}
    p = await conn.fetchrow("select * from payments where id=$1", a["payment_id"])
    if decision == "reject":
        await conn.execute("update release_approvals set state='rejected', decided_at=now(), decided_by=$2 where id=$1",
                           approval_id, by)
        await _event(conn, p["id"], "HUMAN.REJECTED", f"{by} rejected the release.")
        await void_for_po(conn, p["po_id"], reason=f"Release rejected by {by}", incident_id=p["incident_id"])
        return {"ok": True, "state": "rejected"}
    if not code or _hash(code.strip()) != a["code_hash"]:
        return {"ok": False, "error": "That code is not right."}
    await conn.execute("update release_approvals set state='approved', decided_at=now(), decided_by=$2 where id=$1",
                       approval_id, by)
    await _set(conn, p["id"], approved_by=by, approved_at=datetime.now(timezone.utc), state="funds_held")
    await _event(conn, p["id"], "HUMAN.APPROVED", f"{by} approved the release with the emailed code.")
    await emit(conn, incident_id=p["incident_id"], actor="human", event_type="RELEASE_APPROVED",
               human_summary=f"{by} approved releasing ${float(p['amount_usd']):,.2f} for {p['po_id']}.",
               payload={"payment_id": p["id"]})
    if p["match"] == "matched":
        await _capture_and_pay(conn, dict(p), fraction=1.0, incident_id=p["incident_id"])
    return {"ok": True, "state": "approved"}


# ----------------------------------------------------------------- webhooks --

_STATE_FOR_EVENT = {
    "PAYMENT.AUTHORIZATION.VOIDED": "hold_voided",
    "PAYMENT.CAPTURE.COMPLETED": "funds_released",
    "PAYMENT.CAPTURE.REFUNDED": "refunded",
}


async def on_webhook(conn, event: dict, *, verified: bool) -> dict:
    """Reconcile our view of the money with PayPal's signed events."""
    etype = event.get("event_type", "")
    res = event.get("resource") or {}
    ids = {res.get("id"), (res.get("supplementary_data") or {}).get("related_ids", {}).get("authorization_id"),
           (res.get("supplementary_data") or {}).get("related_ids", {}).get("order_id"),
           (res.get("batch_header") or {}).get("payout_batch_id"), res.get("payout_batch_id")}
    ids.discard(None)
    p = None
    for rid in ids:
        p = await conn.fetchrow(
            """select * from payments where authorization_id=$1 or capture_id=$1 or paypal_order_id=$1
                  or payout_batch_id=$1 or refund_id=$1 order by id desc limit 1""", rid)
        if p:
            break
    if not p:
        return {"matched": False}
    await _event(conn, p["id"], f"WEBHOOK · {etype}",
                 f"PayPal confirmed {etype.lower().replace('_', ' ')}" + (" (signature verified)" if verified else " (UNVERIFIED — ignored for state)"),
                 api="POST /api/webhooks/paypal", paypal_id=next(iter(ids), None))
    target = _STATE_FOR_EVENT.get(etype)
    # A capture webhook confirms money we already moved; it must not erase finer states
    # we know about (retention still held, a guard block, a later refund).
    keep = {"refunded", "blocked"} | ({"retention_held"} if target == "funds_released" else set())
    if verified and target and p["state"] != target and p["state"] not in keep:
        await _set(conn, p["id"], state=target)
    return {"matched": True, "payment_id": p["id"], "org_id": p["org_id"]}


# ------------------------------------------------------ hold expiry guard --

async def reauthorize_stale_holds(conn) -> list[str]:
    """PayPal authorizations lapse at 29 days. Refresh any hold older than 25 days."""
    rows = await conn.fetch(
        """select * from payments where not archived and capture_id is null
              and authorization_id is not null and state in ('funds_held','awaiting_approval')""")
    done = []
    for r in rows:
        p = dict(r)
        if not guards.hold_needs_reauth(p):
            continue
        try:
            out = await pp.call("POST", f"/v2/payments/authorizations/{p['authorization_id']}/reauthorize",
                                {"amount": {"currency_code": "USD", "value": f"{float(p['amount_usd']):.2f}"}},
                                op="payments.reauthorize", request_id=f"reauth-{p['id']}-{datetime.now():%Y%m%d}")
        except pp.PayPalError as exc:
            await _event(conn, p["id"], "REAUTHORIZE.FAILED", str(exc))
            continue
        new_id = out.get("id") or p["authorization_id"]
        await _set(conn, p["id"], authorization_id=new_id)
        try:
            await _set(conn, p["id"], reauthorized_at=datetime.now(timezone.utc))
        except Exception:  # noqa: BLE001
            pass
        await _event(conn, p["id"], "PAYMENT.AUTHORIZATION.REAUTHORIZED",
                     "Hold refreshed before PayPal's 29-day expiry; goods still in transit.",
                     api="POST /v2/payments/authorizations/{id}/reauthorize", paypal_id=new_id)
        await guards.record(conn, guards.Verdict("hold_expiry", "adjust",
                            f"Re-authorized the hold on {p['po_id']} before it lapsed.",
                            amount_usd=float(p["amount_usd"])), po_id=p["po_id"], supplier_id=p["supplier_id"])
        done.append(p["po_id"])
    return done


async def release_retention(conn, po_id: str) -> dict | None:
    """Line acceptance passed: capture the retention tranche and pay it to the locked payee."""
    p = await live_payment(conn, po_id)
    if not p or p["state"] != "retention_held" or not p.get("retention_usd"):
        return p
    amt = float(p["retention_usd"])
    cap = await pp.call("POST", f"/v2/payments/authorizations/{p['authorization_id']}/capture",
                        {"final_capture": True, "amount": {"currency_code": "USD", "value": f"{amt:.2f}"},
                         "note_to_payer": f"{po_id}: retention after line acceptance"},
                        op="payments.capture", request_id=f"retention-{p['id']}")
    pv, payee = await guards.payee_lock(conn, p["supplier_id"])
    if payee and pv.outcome == "pass":
        await pp.payout(receiver=payee, amount_usd=amt, note=f"Retention for {po_id}", item_id=f"{po_id}-R",
                        request_id=f"payout-ret-{p['id']}")
    await _set(conn, p["id"], state="funds_released")
    await _event(conn, p["id"], "PAYMENT.CAPTURE.COMPLETED", f"Retention ${amt:,.2f} released after line acceptance.",
                 api="POST /v2/payments/authorizations/{id}/capture", paypal_id=cap.get("id"))
    return await live_payment(conn, po_id)
