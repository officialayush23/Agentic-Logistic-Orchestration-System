"""Sentinel agent: watches the world.

Two jobs:
  risk    the risk detector (agent.wake) already opened the incident; the
          Sentinel records the triage and recalls past episodes for the same part.
  patrol  periodic sweep: buy timers per project/part, supplier push-outs,
          PayPal holds close to expiry (re-authorized by the Treasurer's money layer).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from .. import finance_agent, guards
from ..core import db_conn
from . import memory
from ._common import ctx_of, enter
from .state import step


async def sentinel(state: dict) -> dict:
    org, iid, st = enter(state)
    if state.get("trigger") == "patrol":
        return await _patrol(state, org)

    episodes = await memory.recent_episodes(org, limit=20)
    same = [e for e in episodes if e.get("component_id") == st.get("component_id")]
    recalled = [f"Last time {e['component_id']} broke ({e['incident_id']}): {e.get('outcome')} via "
                f"{e.get('chosen') or 'no plan'}" for e in same[:2]]
    return {
        "ctx": ctx_of(st), "phase": "detected", "recalled": recalled,
        "trail": [step("sentinel", f"Triage: {st.get('headline') or 'production risk'} "
                                   f"(severity {st.get('severity')}, coverage {st.get('coverage_days')} d)",
                       recalled=len(recalled))],
    }


async def _patrol(state: dict, org: str) -> dict:
    now = datetime.now(timezone.utc)
    timers, pushouts, reauth = [], [], []
    async with db_conn() as conn:
        reauth = await finance_agent.reauthorize_stale_holds(conn)
        try:
            rows = await conn.fetch(
                """select b.*, c.display_name from bom_lines b
                     left join components c on c.id = b.component_id
                    where b.ordered_po_id is null""")
        except Exception:  # noqa: BLE001 - tables arrive with migration 0012
            rows = []
        for r in rows:
            order_by = r["need_by"] - timedelta(days=r["lead_time_days"] + r["transit_days"] + r["buffer_days"])
            left_h = (order_by - now).total_seconds() / 3600
            colour = "late" if left_h < 0 else "red" if left_h <= 48 else "amber" if left_h <= 168 else "green"
            timers.append({"project_id": r["project_id"], "component_id": r["component_id"],
                           "name": r["display_name"], "order_by": order_by.isoformat(),
                           "hours_left": round(left_h, 1), "state": colour})
            if colour in ("red", "late"):
                await guards.record(conn, guards.Verdict(
                    "buy_timer", "escalate",
                    f"{r['project_id']}: order {r['display_name'] or r['component_id']} by "
                    f"{order_by:%d %b} or the project slips ({left_h:.0f} h left)."),
                    agent="sentinel")
        try:
            po_rows = await conn.fetch(
                """select id, supplier_id, promised_date, revised_date, acknowledged_at, created_at
                     from purchase_orders where status in ('open','in_transit','delayed')""")
        except Exception:  # noqa: BLE001
            po_rows = []
        for p in po_rows:
            if p["revised_date"] and p["promised_date"] and p["revised_date"] > p["promised_date"]:
                pushouts.append({"po_id": p["id"], "supplier_id": p["supplier_id"], "kind": "push_out",
                                 "days": (p["revised_date"] - p["promised_date"]).days})
            elif p["acknowledged_at"] is None and p["created_at"] < now - timedelta(hours=48):
                pushouts.append({"po_id": p["id"], "supplier_id": p["supplier_id"], "kind": "no_ack"})
    red = [t for t in timers if t["state"] in ("red", "late")]
    return {
        "phase": "patrolled",
        "evidence": {"timers": timers, "pushouts": pushouts, "reauthorized": reauth},
        "trail": [step("sentinel", f"Patrol: {len(timers)} buy timers ({len(red)} red), "
                                   f"{len(pushouts)} push-out/no-ack POs, {len(reauth)} holds re-authorized")],
    }
