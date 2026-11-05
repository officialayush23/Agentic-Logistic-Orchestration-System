"""Liaison agent: every conversation with the outside world.

Supplier RFQs and delay confirmations, warehouse checks, PO-acknowledgement
chases, and the out-of-band confirmation for a payee-change request (sent to
the contact already on file, never to the address in the suspicious email).
Gemini drafts the wording; whether a thread is autonomous or draft-only is the
thread's own setting (comms.py).
"""
from __future__ import annotations

from .. import agent as domain, comms, mailer
from ..core import db_conn
from ._common import ctx_of, enter
from .state import step


async def liaison(state: dict) -> dict:
    org, iid, st = enter(state)
    trig = state.get("trigger")
    sent = 0
    async with db_conn() as conn:
        if trig == "payee_change":
            p = state.get("payload") or {}
            s = await conn.fetchrow("select name, email from suppliers where id=$1", p.get("supplier_id"))
            if s and s["email"]:
                await mailer.send(
                    s["email"], f"Please confirm: payout account change for {s['name']}",
                    (f"We received a request to change your PayPal payout address to {p.get('new_email')} "
                     f"(sent from {p.get('sender') or 'unknown'}). Payouts stay on your verified account "
                     "until you confirm from this address and our approver enters their code."),
                    mailer.card("Payout change on hold", [("Requested", p.get("new_email", "")),
                                                          ("From", p.get("sender") or "unknown"),
                                                          ("Status", "Locked 72 h")]))
                sent += 1
            return {"phase": "communicated",
                    "trail": [step("liaison", f"Asked {s['name'] if s else 'the supplier'} to confirm the payee change "
                                              "from the contact on file")]}
        if trig == "patrol":
            for po in (state.get("evidence") or {}).get("pushouts", [])[:10]:
                await comms.agent_message_supplier(
                    conn, incident_id=iid, supplier_id=po["supplier_id"], kind="delay_confirmation",
                    context={"po_id": po["po_id"],
                             "reason": "no acknowledgement in 48 h" if po["kind"] == "no_ack"
                             else f"ship date pushed {po.get('days')} days"})
                sent += 1
            return {"phase": "communicated",
                    "trail": [step("liaison", f"Chased {sent} supplier(s) for acknowledgement / revised dates")]}
        await domain._communicate(conn, iid)
    return {"ctx": ctx_of(st), "phase": "communicated",
            "trail": [step("liaison", "Contacted contradicted suppliers, the warehouse and alternate suppliers (RFQs)")]}
