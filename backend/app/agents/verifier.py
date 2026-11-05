"""Verifier agent: executed is not resolved.

Closes the incident only when usable stock covers the need, then writes the
episode to long-term memory so the next incident on this part starts smarter.
"""
from __future__ import annotations

from .. import agent as domain
from ..core import db_conn
from . import memory
from ._common import clean, ctx_of, enter
from .state import step


async def verifier(state: dict) -> dict:
    org, iid, st = enter(state)
    if iid.startswith("po:"):
        return {"phase": "verified", "done": True, "trail": [step("verifier", "Standalone PO settled")]}
    async with db_conn() as conn:
        out = clean(await domain.verify(conn, iid))
    resolved = bool(out.get("resolved"))
    plan = state.get("plan") or {}
    await memory.remember_episode(org, iid, {
        "component_id": st.get("component_id"), "component_name": st.get("component_name"),
        "outcome": "resolved" if resolved else f"reopened, {out.get('shortfall')} short",
        "chosen": plan.get("label"), "excluded_by_memory": plan.get("excluded_by_memory"),
        "money": [m for m in state.get("money") or [] if m.get("state")],
        "contradictions": len((state.get("evidence") or {}).get("contradictions") or []),
    })
    return {"ctx": ctx_of(st), "phase": "verified" if resolved else "replan", "done": resolved,
            "trail": [step("verifier", "Usable stock covers the requirement: incident closed" if resolved
                                       else f"Still {out.get('shortfall')} short: back to Sourcing")]}
