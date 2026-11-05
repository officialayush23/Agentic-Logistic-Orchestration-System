"""Approval gate: a real LangGraph interrupt.

The graph stops here and the thread is checkpointed. Nothing runs until a
human answers through the API (`Command(resume=...)`), whether that is ten
seconds or ten days later, on this server or after a redeploy.
"""
from __future__ import annotations

from langgraph.types import interrupt

from ..core import db_conn, emit
from ._common import enter
from .state import step


async def approval(state: dict) -> dict:
    org, iid, st = enter(state)
    plan = state.get("plan") or {}
    # Everything above interrupt() re-runs on resume, so it must be read-only.
    decision = interrupt({
        "type": "plan_approval", "incident_id": iid, "action": plan.get("label"),
        "estimated_cost_inr": plan.get("total_cost_inr"), "kind": plan.get("kind"),
        "narrative": plan.get("narrative"), "options": plan.get("options"),
    }) or {}
    d = decision.get("decision", "reject")
    note = decision.get("note")
    async with db_conn() as conn:
        if d == "approve":
            await conn.execute("update recovery_plans set status='approved', decided_at=now() where id=$1",
                               plan.get("plan_id"))
            phase = "approved"
        else:
            await conn.execute("update recovery_plans set status=$2, decided_at=now() where id=$1",
                               plan.get("plan_id"), "rejected" if d == "reject" else "superseded")
            from .. import claims
            await claims.release_for(conn, iid, f"Plan {d}ed by the operator{': ' + note if note else ''}.")
            for sup in decision.get("exclude") or []:
                await conn.execute(
                    """insert into agent_constraints (incident_id, constraint_type, target, reason, created_by)
                       values ($1,'exclude_supplier',$2,$3,'human')""", iid, sup, note or "Excluded by operator")
            phase = "replan"
        await emit(conn, incident_id=iid, actor="human", event_type="APPROVAL_DECIDED",
                   human_summary=f"Operator {d}d '{plan.get('label')}'" + (f": {note}" if note else ""),
                   payload=decision)
    return {"phase": phase, "approval": decision,
            "trail": [step("approval", f"Human {d}d the plan" + (f" ({note})" if note else ""))]}
