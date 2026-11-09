"""The DisruptionOps multi-agent graph.

                       ┌──────────── supervisor ────────────┐
                       │  (routes every turn on shared state) │
        ┌──────────┬───┴──────┬─────────┬─────────┬──────────┬───────────┬─────────┐
     sentinel  investigator  liaison  sourcing  approval  procurement  treasurer  verifier
                                               (interrupt)             (only one that
                                                                         moves money)

Every specialist hands control back to the supervisor; the supervisor decides
who goes next from the incident's phase and evidence. Routing is policy, not a
guess: the same facts always produce the same next agent, which is what you
want in front of a payment system. The LLM work happens inside the agents that
read language (investigator, liaison, sourcing narrative) and in the Copilot.
"""
from __future__ import annotations

from typing import Literal

from langgraph.graph import END, START, StateGraph
from langgraph.types import Command

from .approval import approval
from .investigator import investigator
from .liaison import liaison
from .procurement import procurement
from .sentinel import sentinel
from .sourcing import sourcing
from .state import IncidentState, step
from .treasurer import treasurer
from .verifier import verifier

MAX_TURNS = 24
Agents = Literal["sentinel", "investigator", "liaison", "sourcing", "approval",
                 "procurement", "treasurer", "verifier", "__end__"]

START_AGENT = {"risk": "sentinel", "patrol": "sentinel", "goods_received": "treasurer",
               "payee_change": "treasurer"}


def route(state: IncidentState) -> tuple[str, str]:
    """(next agent, why). Pure function of state: unit-testable, replayable."""
    t, ph = state.get("trigger"), state.get("phase")
    if state.get("done"):
        return END, "incident closed"
    if state.get("turns", 0) >= MAX_TURNS:
        return END, f"turn budget ({MAX_TURNS}) spent; stopping rather than looping"
    if ph in (None, "start"):
        nxt = START_AGENT.get(t or "", END)
        return nxt, f"trigger '{t}'"
    ev, plan = state.get("evidence") or {}, state.get("plan") or {}
    if ph == "detected":
        return "investigator", "need evidence before any decision"
    if ph == "investigated":
        if ev.get("contradictions") and not ev.get("contradictions_settled"):
            return "treasurer", f"{len(ev['contradictions'])} contradicted claim(s): money must not move on them"
        return "liaison", "evidence clean; contact suppliers and warehouse"
    if ph == "money_secured":
        return "liaison", "holds secured; now talk to suppliers"
    if ph == "communicated":
        return ("sourcing", "suppliers contacted; plan the recovery") if t == "risk" else (END, "messages sent")
    if ph == "no_plan":
        return "approval", "no option passes every hard constraint: a human must decide"
    if ph == "planned":
        if plan.get("requires_approval"):
            return "approval", "plan exceeds the agent's authority or affects another customer"
        return "procurement", "plan within authority"
    if ph == "approved":
        return "procurement", "human approved"
    if ph == "replan":
        return "sourcing", "plan rejected or recovery did not hold"
    if ph == "procured":
        return "treasurer", "new POs need PayPal holds through the guards"
    if ph == "settled":
        return "verifier", "goods settled; verify stock at the plant"
    if ph == "payee_locked":
        return "liaison", "confirm the change with the contact on file"
    if ph == "patrolled":
        return ("liaison", "push-outs / missing acks to chase") if ev.get("pushouts") else (END, "nothing to chase")
    return END, f"phase '{ph}' is terminal for this turn"


async def supervisor(state: IncidentState) -> Command[Agents]:
    nxt, why = route(state)
    return Command(goto=nxt, update={
        "next_agent": nxt, "turns": state.get("turns", 0) + 1,
        "trail": [step("supervisor", f"→ {nxt if nxt != END else 'end'}: {why}")],
    })


def build() -> StateGraph:
    g = StateGraph(IncidentState)
    g.add_node("supervisor", supervisor)
    for name, fn in (("sentinel", sentinel), ("investigator", investigator), ("liaison", liaison),
                     ("sourcing", sourcing), ("approval", approval), ("procurement", procurement),
                     ("treasurer", treasurer), ("verifier", verifier)):
        g.add_node(name, fn)
        g.add_edge(name, "supervisor")
    g.add_edge(START, "supervisor")
    return g
