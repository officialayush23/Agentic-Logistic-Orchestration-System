"""Agent memory: short-term (checkpointer) and long-term (store).

Short-term: LangGraph `AsyncPostgresSaver`, one thread per incident. Every
agent turn is a checkpoint; approvals use `interrupt()` and resume from it.

Long-term: LangGraph `AsyncPostgresStore`, namespaced per organisation:
    ("org", org, "supplier", SUP-21)   profile  → contradictions, late, defects, payee alerts
    ("org", org, "episode")            INC-301  → what happened and what worked
    ("org", org, "copilot", user)      notes    → what the user asked the copilot to remember

Both live in the `langgraph` schema (not exposed by PostgREST). Without a
reachable database (unit tests, a laptop offline) the same interfaces fall back
to in-process memory so the graph still runs.
"""
from __future__ import annotations

import logging
import os
from typing import Any

log = logging.getLogger("disruptionops.memory")

_saver = None
_store = None
_pool = None
MODE = "uninitialised"


def _session_url() -> str | None:
    url = os.getenv("LANGGRAPH_DATABASE_URL") or os.getenv("DATABASE_URL")
    if not url:
        return None
    # Supabase transaction pooler (6543) cannot hold session settings; the
    # checkpointer needs session mode (5432) on the same host.
    return url.replace(":6543/", ":5432/")


async def open_memory(force_memory: bool = False):
    """Open the checkpointer and store once per process."""
    global _saver, _store, _pool, MODE
    if _saver is not None:
        return _saver, _store
    url = None if force_memory or os.getenv("AGENT_MEMORY", "").lower() == "memory" else _session_url()
    if url:
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import AsyncConnectionPool
            from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
            from langgraph.store.postgres.aio import AsyncPostgresStore

            async def _configure(conn):
                await conn.execute("set search_path to langgraph, public")

            pool = AsyncConnectionPool(url, min_size=1, max_size=int(os.getenv("AGENT_POOL_MAX", "5")),
                                       open=False, configure=_configure, timeout=15,
                                       kwargs={"autocommit": True, "prepare_threshold": None,
                                               "row_factory": dict_row})
            await pool.open(wait=True, timeout=15)
            saver, store = AsyncPostgresSaver(pool), AsyncPostgresStore(pool)
            await saver.setup()
            await store.setup()
            _pool, _saver, _store, MODE = pool, saver, store, "postgres"
            log.info("agent memory: postgres (schema langgraph)")
            return _saver, _store
        except Exception as exc:  # noqa: BLE001
            log.warning("agent memory: postgres unavailable (%s); using in-process memory", exc)
    from langgraph.checkpoint.memory import InMemorySaver
    from langgraph.store.memory import InMemoryStore
    _saver, _store, MODE = InMemorySaver(), InMemoryStore(), "memory"
    return _saver, _store


async def close_memory() -> None:
    global _saver, _store, _pool, MODE
    if _pool is not None:
        await _pool.close()
    _saver = _store = _pool = None
    MODE = "uninitialised"


def store():
    return _store


# ------------------------------------------------------- long-term facts --

def _ns(org: str, *parts: str) -> tuple[str, ...]:
    return ("org", org or "default", *parts)


async def supplier_profile(org: str, supplier_id: str) -> dict[str, Any]:
    if _store is None:
        return {}
    item = await _store.aget(_ns(org, "supplier"), supplier_id)
    return dict(item.value) if item else {}


async def remember_supplier(org: str, supplier_id: str, kind: str, note: str, **extra: Any) -> dict:
    """kind: contradiction | late | defect | payee_alert | good_delivery."""
    if _store is None:
        return {}
    prof = await supplier_profile(org, supplier_id)
    counts = dict(prof.get("counts") or {})
    counts[kind] = counts.get(kind, 0) + 1
    events = list(prof.get("events") or [])[-19:] + [{"kind": kind, "note": note, **extra}]
    prof = {"supplier_id": supplier_id, "counts": counts, "events": events,
            "trust": _trust(counts)}
    await _store.aput(_ns(org, "supplier"), supplier_id, prof)
    return prof


def _trust(counts: dict[str, int]) -> str:
    bad = counts.get("contradiction", 0) * 2 + counts.get("defect", 0) + counts.get("late", 0) \
        + counts.get("payee_alert", 0) * 2
    good = counts.get("good_delivery", 0)
    score = good - bad
    return "trusted" if score >= 2 else "watch" if score > -2 else "proof_only"


async def remember_episode(org: str, incident_id: str, summary: dict[str, Any]) -> None:
    if _store is not None:
        await _store.aput(_ns(org, "episode"), incident_id, summary)


async def recent_episodes(org: str, limit: int = 5) -> list[dict[str, Any]]:
    if _store is None:
        return []
    items = await _store.asearch(_ns(org, "episode"), limit=limit)
    return [i.value | {"incident_id": i.key} for i in items]
