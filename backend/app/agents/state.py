"""Shared state for the DisruptionOps multi-agent graph.

One LangGraph thread per incident (thread_id = incident id). The checkpointer
persists this state after every agent turn, so a restart, a human approval
three hours later or a goods receipt next week all continue the same thread
with the same facts.
"""
from __future__ import annotations

import operator
from datetime import datetime, timezone
from typing import Annotated, Any, Literal, TypedDict

AgentName = Literal["sentinel", "investigator", "liaison", "sourcing", "approval",
                    "procurement", "treasurer", "verifier"]

TRIGGERS = ("risk", "goods_received", "payee_change", "patrol", "instruction", "invoice")


def _merge(a: dict | None, b: dict | None) -> dict:
    return {**(a or {}), **(b or {})}


class IncidentState(TypedDict, total=False):
    # identity
    incident_id: str
    org_id: str
    trigger: str                       # what woke the system this turn
    payload: dict[str, Any]            # the trigger's facts (po_id, qty, email…)

    # working memory carried across turns (checkpointed)
    ctx: Annotated[dict[str, Any], _merge]      # component, severity, coverage, solver result…
    phase: str                                  # where the incident is in its lifecycle
    evidence: Annotated[dict[str, Any], _merge] # contradictions, suppliers available
    plan: Annotated[dict[str, Any], _merge]     # chosen option, approval need, narrative
    purchase_orders: list[dict[str, Any]]
    approval: dict[str, Any]

    # append-only logs (reducer = list concat)
    trail: Annotated[list[dict[str, Any]], operator.add]       # who did what
    guard_verdicts: Annotated[list[dict[str, Any]], operator.add]
    money: Annotated[list[dict[str, Any]], operator.add]       # PayPal actions taken
    recalled: Annotated[list[str], operator.add]               # long-term memory used this run

    # routing
    next_agent: str
    turns: int
    done: bool
    error: str


def step(agent: str, action: str, **detail: Any) -> dict[str, Any]:
    return {"agent": agent, "action": action,
            "at": datetime.now(timezone.utc).isoformat(timespec="seconds"), **detail}
