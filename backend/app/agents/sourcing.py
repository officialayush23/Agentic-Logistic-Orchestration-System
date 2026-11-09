"""Sourcing agent: finds the recovery plan.

Deterministic solver (certification, hazmat-can't-fly, budget, deadline, cost,
supplier risk). Long-term memory changes its behaviour for real: a supplier
whose memory profile says `proof_only` (repeat contradictions or payee alerts)
is excluded for this incident before the solver runs, with the reason logged.
"""
from __future__ import annotations

from .. import agent as domain
from ..core import db_conn, emit
from . import memory
from ._common import clean, ctx_of, enter
from .state import step


async def sourcing(state: dict) -> dict:
    org, iid, st = enter(state)
    excluded = []
    store = memory.store()
    async with db_conn() as conn:
        if store is not None:
            for item in await store.asearch(("org", org, "supplier"), limit=200):
                prof = item.value or {}
                if memory._trust(prof.get("counts") or {}) == "proof_only":
                    exists = await conn.fetchval(
                        """select 1 from agent_constraints where incident_id=$1 and target=$2
                            and constraint_type='exclude_supplier' and active""", iid, item.key)
                    if not exists:
                        await conn.execute(
                            """insert into agent_constraints (incident_id, constraint_type, target, reason, created_by)
                               values ($1,'exclude_supplier',$2,$3,'agent')""",
                            iid, item.key, f"Memory: {prof.get('counts')} → proof_only")
                        await emit(conn, incident_id=iid, actor="agent", event_type="MEMORY_APPLIED",
                                   human_summary=f"Excluded {item.key}: its record ({prof.get('counts')}) "
                                                 "puts it on proof-only terms.",
                                   payload={"supplier_id": item.key, "profile": prof})
                    excluded.append(item.key)
        await domain._plan_and_validate(conn, iid, auto_execute=False)
    result = clean(st.get("result") or {})
    chosen = result.get("chosen")
    if not chosen:
        return {"ctx": ctx_of(st), "phase": "no_plan", "plan": {"chosen": None},
                "trail": [step("sourcing", "No feasible recovery option passed the hard constraints")]}
    plan = {"plan_id": st.get("plan_id"), "label": chosen.get("label"), "kind": chosen.get("kind"),
            "score": chosen.get("score"), "total_cost_inr": chosen.get("total_cost"),
            "requires_approval": bool(chosen.get("requires_approval")),
            "options": len(result.get("options") or []), "rejections": len(result.get("rejections") or []),
            "narrative": st.get("narrative"), "excluded_by_memory": excluded,
            "lines": chosen.get("lines") or []}
    return {"ctx": ctx_of(st), "phase": "planned", "plan": plan,
            "recalled": [f"Excluded {s} on its memory record" for s in excluded],
            "trail": [step("sourcing", f"Chose '{plan['label']}' (score {plan['score']}) from {plan['options']} "
                                       f"option(s); {plan['rejections']} rejected on hard constraints"
                                       + ("; needs human approval" if plan["requires_approval"] else ""))]}
