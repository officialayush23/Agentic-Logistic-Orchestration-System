"""Copilot: a Gemini ReAct agent the operator can talk to.

Tools are read-only over the same database, the agent team's live threads and
long-term memory, plus one write: saving a note the user asks it to remember.
It cannot hold, capture, void or pay. Conversation memory is a LangGraph
thread per user (same checkpointer as the team).
"""
from __future__ import annotations

import json
import os
from typing import Any

from langchain_core.tools import tool

from .. import guards
from ..core import db_conn, set_org
from . import memory, runtime

SYSTEM = (
    "You are the DisruptionOps Copilot for a manufacturing buyer. Answer from tools, never from guesses. "
    "You can read projects, incidents (the agent team's live state), payments and the Buyer Shield ledger, "
    "supplier memory, and PayPal itself through the PayPal Agent Toolkit (order details, invoices). You cannot move money: holds, captures, voids and payouts are made only by the "
    "Treasurer agent through deterministic guards. Be brief, give numbers with their source, and say "
    "plainly when data is missing."
)


def _j(x: Any) -> str:
    return json.dumps(x, default=str)[:6000]


@tool
async def list_projects() -> str:
    """List customer projects with due date, health and money committed."""
    async with db_conn() as conn:
        rows = await conn.fetch("select * from projects order by id")
    return _j([dict(r) for r in rows])


@tool
async def get_incident(incident_id: str) -> str:
    """Live state of an incident thread: phase, plan, evidence, money actions, guard verdicts, whether it waits for a human."""
    s = await runtime.state(incident_id)
    v = s.get("values") or {}
    return _j({"phase": v.get("phase"), "plan": v.get("plan"), "evidence": v.get("evidence"),
               "money": v.get("money"), "guards": v.get("guard_verdicts"),
               "waiting_for_human": s.get("waiting_for_human"), "trail": (v.get("trail") or [])[-12:]})


@tool
async def open_incidents() -> str:
    """Open incidents with status and severity."""
    async with db_conn() as conn:
        rows = await conn.fetch("""select id, status, severity, title, component_id, opened_at
                                     from incidents where status not in ('resolved','failed') order by opened_at desc""")
    return _j([dict(r) for r in rows])


@tool
async def payments(po_id: str = "", supplier_id: str = "") -> str:
    """PayPal payments ledger, optionally filtered by PO or supplier."""
    async with db_conn() as conn:
        rows = await conn.fetch(
            """select po_id, supplier_id, state, amount_usd, captured_usd, credit_usd, retention_usd,
                      authorization_id, capture_id, refund_id, payout_batch_id, note, updated_at
                 from payments where not archived and ($1='' or po_id=$1) and ($2='' or supplier_id=$2)
                order by id desc limit 40""", po_id, supplier_id)
    return _j([dict(r) for r in rows])


@tool
async def buyer_shield() -> str:
    """Money protected by each Buyer Shield guard, plus the latest guard decisions."""
    async with db_conn() as conn:
        summ = await guards.protected_summary(conn)
        try:
            rows = await conn.fetch("""select guard, outcome, po_id, amount_usd, reason, created_at
                                         from guard_events order by id desc limit 15""")
        except Exception:  # noqa: BLE001
            rows = []
    return _j({"summary": summ, "latest": [dict(r) for r in rows]})


@tool
async def supplier_memory(supplier_id: str) -> str:
    """What the agents remember about a supplier: contradictions, late deliveries, defects, payee alerts, trust level."""
    from ..core import current_org
    return _j(await memory.supplier_profile(current_org() or "NEXA", supplier_id))


@tool
async def past_episodes() -> str:
    """Recent incidents the team resolved and what worked."""
    from ..core import current_org
    return _j(await memory.recent_episodes(current_org() or "NEXA", limit=8))


@tool
async def remember_note(note: str) -> str:
    """Save a note the user explicitly asks you to remember for future conversations."""
    from ..core import current_org
    st = memory.store()
    if st is None:
        return "memory unavailable"
    import uuid
    await st.aput(("org", current_org() or "NEXA", "copilot_notes"), uuid.uuid4().hex[:12], {"note": note})
    return "saved"


TOOLS = [list_projects, open_incidents, get_incident, payments, buyer_shield, supplier_memory,
         past_episodes, remember_note]


def paypal_toolkit_tools() -> list:
    """PayPal Agent Toolkit, read-only: the Copilot can look things up in PayPal; it can't move money."""
    cid, sec = os.getenv("PAYPAL_CLIENT_ID"), os.getenv("PAYPAL_CLIENT_SECRET")
    if not (cid and sec):
        return []
    try:
        from paypal_agent_toolkit.langchain.toolkit import PayPalToolkit
        from paypal_agent_toolkit.shared.configuration import Configuration, Context
    except Exception:  # noqa: BLE001
        return []
    cfg = Configuration(actions={"orders": {"get": True}, "invoices": {"list": True, "get": True}},
                        context=Context(sandbox=os.getenv("PAYPAL_ENV", "sandbox") != "live"))
    return PayPalToolkit(client_id=cid, secret=sec, configuration=cfg).get_tools()

_agent = None


async def agent():
    global _agent
    if _agent is None:
        from langchain_google_genai import ChatGoogleGenerativeAI
        from langgraph.prebuilt import create_react_agent
        saver, store = await memory.open_memory()
        model = ChatGoogleGenerativeAI(model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
                                       google_api_key=os.getenv("GEMINI_API_KEY"), temperature=0.2)
        _agent = create_react_agent(model, TOOLS + paypal_toolkit_tools(), prompt=SYSTEM, checkpointer=saver, store=store)
    return _agent


async def ask(question: str, *, user: str, org: str) -> dict:
    set_org(org)
    notes = []
    st = memory.store()
    if st is not None:
        notes = [i.value.get("note") for i in await st.asearch(("org", org, "copilot_notes"), limit=10)]
    a = await agent()
    msg = question if not notes else f"{question}\n\n(Notes the user asked you to remember: {notes})"
    out = await a.ainvoke({"messages": [("user", msg)]},
                          {"configurable": {"thread_id": f"copilot:{org}:{user}"}, "recursion_limit": 20})
    msgs = out["messages"]
    used = [m.name for m in msgs if getattr(m, "type", "") == "tool"]
    text = msgs[-1].content
    if isinstance(text, list):
        text = " ".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in text)
    return {"answer": text, "tools_used": used}
