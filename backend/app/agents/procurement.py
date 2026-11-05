"""Procurement agent: turns the approved plan into purchase orders (ERP).

Creates the POs and confirms them with the suppliers. It never holds money:
the Treasurer does that next, through the Buyer Shield guards.
"""
from __future__ import annotations

from .. import agent as domain
from ..core import db_conn
from ._common import clean, ctx_of, enter
from .state import step


async def procurement(state: dict) -> dict:
    org, iid, st = enter(state)
    async with db_conn() as conn:
        await domain.execute(conn, iid, hold_money=False)
    pos = clean(st.get("created_pos") or [])
    return {"ctx": ctx_of(st), "phase": "procured", "purchase_orders": pos,
            "trail": [step("procurement", f"Raised {len(pos)} purchase order(s): "
                                          + ", ".join(p["po_id"] for p in pos))]}
