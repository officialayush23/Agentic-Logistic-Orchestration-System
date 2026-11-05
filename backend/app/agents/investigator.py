"""Investigator agent: gathers evidence and finds the lies.

Runs the mandatory evidence pack (stock, inbound, carrier tracking, suppliers)
and uses Gemini to read supplier claims against carrier truth. It does not
touch money: contradictions are handed to the Treasurer through shared state.
Every contradiction is written to the supplier's long-term memory profile.
"""
from __future__ import annotations

from .. import agent as domain
from ..core import db_conn
from . import memory
from ._common import clean, ctx_of, enter
from .state import step


async def investigator(state: dict) -> dict:
    org, iid, st = enter(state)
    async with db_conn() as conn:
        await domain._investigate(conn, iid, settle_money=False)
    contradictions = clean(st.get("contradictions") or [])
    recalled = []
    for c in contradictions:
        prof = await memory.remember_supplier(
            org, c["supplier_id"], "contradiction",
            f"Claimed '{c.get('supplier_claim')}' on {c['id']}; carrier showed '{c.get('tracking_status')}'",
            po_id=c["id"], incident_id=iid)
        recalled.append(f"{c.get('supplier_name') or c['supplier_id']}: "
                        f"{prof['counts'].get('contradiction', 0)} contradiction(s) on record, trust={prof['trust']}")
    return {
        "ctx": ctx_of(st), "phase": "investigated",
        "evidence": {"contradictions": contradictions, "suppliers_available": st.get("suppliers_available"),
                     "contradictions_settled": False},
        "recalled": recalled,
        "trail": [step("investigator", f"Evidence pack done: {len(contradictions)} contradicted claim(s), "
                                       f"{st.get('suppliers_available') or 0} candidate supplier(s)")],
    }
