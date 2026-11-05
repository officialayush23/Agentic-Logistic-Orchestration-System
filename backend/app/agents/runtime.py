"""Run, resume and inspect agent threads.

thread_id = incident id (or "po:<id>" for a delivery with no incident,
"patrol:<org>" for the periodic sweep). Every agent turn is streamed to the
UI over the existing websocket hub as `agent_turn`.
"""
from __future__ import annotations

import asyncio
import logging
import os
import traceback
from typing import Any

from langgraph.types import Command

from ..core import broadcast_state, current_org, db_conn, emit, set_org
from . import memory
from .graph import build

log = logging.getLogger("disruptionops.agents")

_graph = None
_lock = asyncio.Lock()
_RUNNING: dict[str, asyncio.Task] = {}


def enabled() -> bool:
    return os.getenv("MULTI_AGENT", "true").lower() not in ("0", "false", "no")


async def graph():
    global _graph
    async with _lock:
        if _graph is None:
            saver, store = await memory.open_memory()
            _graph = build().compile(checkpointer=saver, store=store)
    return _graph


def _cfg(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}, "recursion_limit": 60}


async def _drive(thread_id: str, inp: Any, org: str) -> dict:
    set_org(org)
    g = await graph()
    last: dict = {}
    try:
        async for chunk in g.astream(inp, _cfg(thread_id), stream_mode="updates"):
            for node, update in chunk.items():
                if node == "__interrupt__":
                    payload = update[0].value if update else {}
                    await broadcast_state("agent_interrupt", {"thread_id": thread_id, "request": payload})
                    continue
                trail = (update or {}).get("trail") or []
                await broadcast_state("agent_turn", {
                    "thread_id": thread_id, "agent": node, "phase": (update or {}).get("phase"),
                    "said": trail[-1]["action"] if trail else None})
                last = update or last
    except Exception as exc:  # noqa: BLE001
        log.exception("agent thread %s failed", thread_id)
        async with db_conn() as conn:
            await emit(conn, incident_id=None if ":" in thread_id else thread_id, actor="agent",
                       event_type="AGENT_FAILED", human_summary=f"The agent team stopped: {exc}",
                       payload={"thread_id": thread_id, "error": str(exc), "traceback": traceback.format_exc()})
            if ":" not in thread_id:
                await conn.execute("update incidents set status='failed' where id=$1", thread_id)
        raise
    return last


def _spawn(thread_id: str, inp: Any, org: str) -> asyncio.Task:
    async def run():
        try:
            await _drive(thread_id, inp, org)
        except Exception:  # noqa: BLE001 - already reported
            pass
        finally:
            _RUNNING.pop(thread_id, None)
    t = asyncio.create_task(run())
    _RUNNING[thread_id] = t
    return t


def _start(trigger: str, thread_id: str, org: str, **extra: Any) -> dict:
    return {"incident_id": thread_id, "org_id": org, "trigger": trigger, "phase": "start",
            "turns": 0, "done": False, **extra}


# ---------------------------------------------------------------- entry --

def start_incident(incident_id: str, *, ctx: dict, org: str | None = None) -> asyncio.Task | None:
    """Called by agent.wake() after the Sentinel's risk detector opened the incident."""
    if incident_id in _RUNNING:
        return None
    org = org or current_org() or "NEXA"
    return _spawn(incident_id, _start("risk", incident_id, org, ctx=ctx, plan={}, evidence={}), org)


async def goods_received(*, po_id: str, received: int, approved: int, incident_id: str | None,
                         invoice_number: str | None = None, org: str | None = None) -> dict:
    org = org or current_org() or "NEXA"
    tid = incident_id or f"po:{po_id}"
    return await _drive(tid, _start("goods_received", tid, org, payload={
        "po_id": po_id, "received": received, "approved": approved, "invoice_number": invoice_number}), org)


async def payee_change(*, supplier_id: str, new_email: str, sender: str | None, org: str | None = None) -> dict:
    org = org or current_org() or "NEXA"
    tid = f"payee:{supplier_id}"
    return await _drive(tid, _start("payee_change", tid, org, payload={
        "supplier_id": supplier_id, "new_email": new_email, "sender": sender}), org)


async def patrol(org: str | None = None) -> dict:
    org = org or current_org() or "NEXA"
    tid = f"patrol:{org}"
    return await _drive(tid, _start("patrol", tid, org, evidence={}), org)


async def resume(incident_id: str, *, decision: str, note: str | None = None,
                 exclude: list[str] | None = None, org: str | None = None) -> bool:
    """Answer a pending interrupt. Returns False if the thread is not waiting."""
    snap = await state(incident_id)
    if not snap.get("waiting_for_human"):
        return False
    org = org or current_org() or snap.get("values", {}).get("org_id") or "NEXA"
    _spawn(incident_id, Command(resume={"decision": decision, "note": note, "exclude": exclude or []}), org)
    return True


# ------------------------------------------------------------- inspect --

async def state(thread_id: str) -> dict:
    g = await graph()
    snap = await g.aget_state(_cfg(thread_id))
    interrupts = [i.value for t in (snap.tasks or []) for i in (t.interrupts or [])]
    return {"thread_id": thread_id, "values": snap.values or {}, "next": list(snap.next or []),
            "waiting_for_human": bool(interrupts), "interrupts": interrupts,
            "checkpoint_id": (snap.config or {}).get("configurable", {}).get("checkpoint_id"),
            "running": thread_id in _RUNNING, "memory": memory.MODE}


async def history(thread_id: str, limit: int = 50) -> list[dict]:
    g = await graph()
    out = []
    async for s in g.aget_state_history(_cfg(thread_id), limit=limit):
        v = s.values or {}
        out.append({"checkpoint_id": s.config["configurable"].get("checkpoint_id"),
                    "next": list(s.next or []), "phase": v.get("phase"), "turns": v.get("turns"),
                    "created_at": s.created_at, "step": (s.metadata or {}).get("step")})
    return out


async def mermaid() -> str:
    g = await graph()
    return g.get_graph().draw_mermaid()
