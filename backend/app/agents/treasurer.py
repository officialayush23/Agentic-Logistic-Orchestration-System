"""Treasurer agent: the only agent that can move money, and it has no LLM.

    investigated + contradictions → void (or refund) those PayPal holds
    procured                      → hold each new PO (fair-price + budget guards), expedite fee
    goods_received                → three-way match, duplicate / late-credit / holdback /
                                    payee-lock guards, partial capture, payout
    payee_change                  → lock the payee, cooling-off, owner code

Every guard verdict it triggers is read back into graph state so the trail shows
exactly which guard decided what.
"""
from __future__ import annotations

from .. import agent as domain, finance_agent, guards
from ..core import db_conn
from . import memory
from ._common import clean, enter
from .state import step


async def _verdicts(conn, po_ids: list[str]) -> list[dict]:
    if not po_ids:
        return []
    try:
        rows = await conn.fetch(
            """select guard, outcome, po_id, amount_usd, reason from guard_events
                where po_id = any($1::text[]) and created_at > now() - interval '5 minutes'
                order by id""", po_ids)
    except Exception:  # noqa: BLE001
        return []
    return clean([dict(r) for r in rows])


def _money(p: dict | None) -> dict:
    p = p or {}
    return clean({k: p.get(k) for k in ("po_id", "state", "amount_usd", "captured_usd", "credit_usd",
                                         "retention_usd", "authorization_id", "capture_id", "note")})


async def treasurer(state: dict) -> dict:
    org, iid, st = enter(state)
    trig, phase = state.get("trigger"), state.get("phase")
    money, touched, said = [], [], ""
    async with db_conn() as conn:
        if trig == "payee_change":
            p = state.get("payload") or {}
            at_risk = float(await conn.fetchval(
                """select coalesce(sum(amount_usd),0) from payments where supplier_id=$1 and not archived
                    and state in ('funds_held','awaiting_approval','retention_held')""", p.get("supplier_id")) or 0)
            v = await guards.request_payee_change(conn, p["supplier_id"], p["new_email"],
                                                  sender=p.get("sender"), amount_at_risk_usd=at_risk)
            await memory.remember_supplier(org, p["supplier_id"], "payee_alert", v.reason)
            return {"phase": "payee_locked", "guard_verdicts": [clean(v.to_dict())],
                    "trail": [step("treasurer", v.reason)]}

        if trig == "goods_received":
            p = state.get("payload") or {}
            out = await finance_agent.on_goods_received(
                conn, p["po_id"], received=int(p["received"]), approved=int(p["approved"]),
                incident_id=iid if not iid.startswith("po:") else None,
                invoice_number=p.get("invoice_number"))
            money.append(_money(out))
            touched = [p["po_id"]]
            verdicts = await _verdicts(conn, touched)
            sup = (out or {}).get("supplier_id")
            if sup:
                kinds = {v["guard"] for v in verdicts if v["outcome"] != "pass"}
                if "late_credit" in kinds:
                    await memory.remember_supplier(org, sup, "late", f"{p['po_id']} delivered late")
                if int(p["approved"]) < int(p["received"]):
                    await memory.remember_supplier(org, sup, "defect",
                                                   f"{p['po_id']}: {int(p['received']) - int(p['approved'])} rejected at QC")
                if not kinds and (out or {}).get("state") in ("funds_released", "retention_held"):
                    await memory.remember_supplier(org, sup, "good_delivery", f"{p['po_id']} on time, QC passed")
            said = f"Settled {p['po_id']}: {(out or {}).get('state')}"
            return {"phase": "settled", "money": money, "guard_verdicts": verdicts,
                    "trail": [step("treasurer", said, guards=len(verdicts))]}

        if phase == "investigated":
            for c in (state.get("evidence") or {}).get("contradictions", []):
                out = await finance_agent.void_for_po(
                    conn, c["id"], incident_id=iid,
                    reason=f"{c.get('supplier_name') or c['supplier_id']} claimed '{c.get('supplier_claim')}' "
                           f"but the carrier shows '{c.get('tracking_status')}'")
                if out:
                    money.append(_money(out))
                    touched.append(c["id"])
                    await guards.record(conn, guards.Verdict(
                        "pay_on_proof", "block", f"No payment on a contradicted claim ({c['id']}).",
                        amount_usd=float(out.get("amount_usd") or 0)),
                        po_id=c["id"], supplier_id=c["supplier_id"], incident_id=iid)
            return {"phase": "money_secured", "money": money, "evidence": {"contradictions_settled": True},
                    "guard_verdicts": await _verdicts(conn, touched),
                    "trail": [step("treasurer", f"Pay-on-proof: {len(money)} hold(s) voided/refunded on "
                                                "contradicted claims")]}

        if phase == "procured":
            for po in state.get("purchase_orders") or []:
                out = await finance_agent.hold_for_po(conn, po["po_id"], incident_id=iid,
                                                      reason=f"Recovery order for incident {iid}")
                money.append(_money(out))
                touched.append(po["po_id"])
                if po.get("mode") == "AIR" and out and out.get("authorization_id"):
                    fee = max(15.0, round(float(out["amount_usd"]) * 0.03, 2))
                    fee_out = await finance_agent.expedite_fee(conn, incident_id=iid, po_id=po["po_id"], amount_usd=fee)
                    if fee_out:
                        money.append({"po_id": po["po_id"], "state": "expedite_fee_paid", "amount_usd": fee})
            await domain._set_status(conn, iid, "verifying")
            held = [m for m in money if m.get("state") in ("funds_held", "awaiting_approval")]
            blocked = [m for m in money if m.get("state") == "blocked"]
            return {"phase": "awaiting_goods", "money": money, "guard_verdicts": await _verdicts(conn, touched),
                    "trail": [step("treasurer", f"Holds placed: {len(held)}; blocked by guards: {len(blocked)}. "
                                                "Money moves only on verified goods.")]}

    return {"phase": phase, "trail": [step("treasurer", "Nothing to do in this phase")]}
