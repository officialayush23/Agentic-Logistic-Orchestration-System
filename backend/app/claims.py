"""Reserve scarce things, don't just read them.

Two incidents can be in flight at once — `agent._RUNNING` is a dict of one task
per incident, and that is deliberate. What was not deliberate is what happened
when they both reached for the same rupee.

The budget filter read only what had already been *placed*::

    spent       = sum(total_value) from purchase_orders where created_by_agent
    budget_left = EMERGENCY_BUDGET_INR - spent

Nothing held money between an option being *chosen* and the order being
*committed*. Two incidents each read the same ₹5,00,000, each approved
₹4,00,000, and both passed OVER_BUDGET. The authority boundary we put on stage
as a hard ceiling was not one. Supplier units had the identical hole: the
catalogue's `available_quantity` was read raw, so two incidents could allocate
the same 800 units. (Plant stock was already protected — `NEED_SQL` nets it
against competing production orders. Supplier availability had no equivalent.)

So: a chosen option **holds** its budget and its units from the moment it is
chosen. Not when the PO is placed — because "waiting for a human to approve" is
precisely the window the leak lived in, and an approval queue is exactly where
two incidents sit side by side.

    budget_left = EMERGENCY_BUDGET − placed − held

Three rules this module exists to keep:

1. **A hold is as binding as a spend.** An option that is chosen but unapproved
   has still taken the money out of everyone else's reach.
2. **Every release names its reason.** A claim that quietly disappears is the
   same leak wearing different clothes, so the release path always writes an
   audit event and the table refuses a release with no reason.
3. **The loser is told who won.** `OVER_BUDGET` used to say "above the
   ₹X remaining". It can now say *which incident is holding the difference and
   why* — which is the sentence that makes contention legible instead of
   arbitrary.

NOTHING HERE DECIDES ANYTHING. It reports what is reserved; the solver still
chooses, and `triage` (when it lands) still ranks.
"""
from __future__ import annotations

from typing import Any

from .core import EMERGENCY_BUDGET_INR, emit


# ------------------------------------------------------------------ reading --


async def budget_state(conn) -> dict[str, Any]:
    """What is spent, what is held, and who is holding it.

    `placed` claims are excluded from the held sum on purpose: once the purchase
    order exists it is counted by `purchase_orders`, and counting it in both
    places would charge the same rupee twice and refuse options that are
    genuinely affordable. Over-strictness is a quieter bug than a leak but it is
    still a bug.
    """
    placed = float(await conn.fetchval(
        "select coalesce(sum(total_value), 0) from purchase_orders "
        "where created_by_agent") or 0)

    # `hours_to_stop` and `priority` are here so a refusal can say *how much*
    # sooner the winner stops, not merely that it won. "Lost this to INC-002"
    # is an outcome; "lost this to INC-002, which stops a critical line 9h
    # sooner" is a decision, and only the second can be argued with.
    rows = await conn.fetch(
        """select c.incident_id, c.amount, c.reason,
                  i.severity::text as severity, i.title,
                  comp.display_name as component_name,
                  po.priority::text as priority,
                  greatest(0, extract(epoch from (po.deadline - now())) / 3600.0)
                      as hours_to_stop
             from resource_claims c
             left join incidents i on i.id = c.incident_id
             left join components comp on comp.id = i.component_id
             left join lateral (
                   select p.* from production_orders p
                    where p.required_component = i.component_id and not p.is_on_hold
                    order by p.deadline limit 1
             ) po on true
            where c.kind = 'budget' and c.state = 'held'
            order by c.amount desc""")
    held = float(sum(float(r["amount"]) for r in rows))

    return {
        "budget_total": float(EMERGENCY_BUDGET_INR),
        "placed": placed,
        "held": held,
        "left": float(EMERGENCY_BUDGET_INR) - placed - held,
        "holders": [
            {"incident_id": r["incident_id"], "amount": float(r["amount"]),
             "reason": r["reason"], "severity": r["severity"],
             "title": r["title"], "component_name": r["component_name"],
             "priority": r["priority"],
             "hours_to_stop": (float(r["hours_to_stop"])
                               if r["hours_to_stop"] is not None else None)}
            for r in rows],
    }


async def held_units(conn, component_id: str | None = None) -> dict[str, dict]:
    """supplier_id -> {units, incident_id} currently reserved by someone else.

    Keyed by supplier because that is how the candidate rows are keyed. When two
    incidents want the same part from the same supplier the second one has to
    see a smaller number, or both will size an order against stock that is
    already spoken for.
    """
    rows = await conn.fetch(
        """select supplier_id,
                  sum(amount)::bigint as units,
                  min(incident_id)    as incident_id,
                  count(*)            as claims
             from resource_claims
            where kind = 'units' and state = 'held'
              and ($1::text is null or component_id = $1)
            group by supplier_id""", component_id)
    return {r["supplier_id"]: {"units": int(r["units"]),
                               "incident_id": r["incident_id"],
                               "claims": int(r["claims"])}
            for r in rows if r["supplier_id"]}


# ------------------------------------------------------------------ writing --


async def hold(conn, *, incident_id: str, reason: str,
               budget: float = 0.0,
               units: int = 0,
               supplier_id: str | None = None,
               component_id: str | None = None,
               scenario_run_id: int | None = None) -> list[int]:
    """Reserve budget and/or units for one incident. Returns the claim ids.

    Called at the moment an option is chosen — before approval, before the PO.
    Idempotency is the caller's job: `release_for` first if you are re-planning
    the same incident, or the old hold sits there starving everyone else.
    """
    ids: list[int] = []
    if budget and budget > 0:
        ids.append(await conn.fetchval(
            """insert into resource_claims
                 (incident_id, scenario_run_id, kind, amount, reason)
               values ($1, $2, 'budget', $3, $4) returning id""",
            incident_id, scenario_run_id, float(budget), reason))
    if units and units > 0 and supplier_id:
        ids.append(await conn.fetchval(
            """insert into resource_claims
                 (incident_id, scenario_run_id, kind, supplier_id, component_id,
                  amount, reason)
               values ($1, $2, 'units', $3, $4, $5, $6) returning id""",
            incident_id, scenario_run_id, supplier_id, component_id,
            float(units), reason))

    if ids:
        await emit(conn, incident_id=incident_id, actor="agent",
                   event_type="RESOURCE_HELD",
                   human_summary=(
                       f"Reserved "
                       + " and ".join(filter(None, [
                           f"Rs {budget:,.0f} of the emergency budget" if budget else None,
                           f"{units} units from {supplier_id}" if units and supplier_id
                           else None]))
                       + f" for this incident. {reason}"),
                   agent_reason=(
                       "Held at the moment the option was chosen, not when the order "
                       "is placed. An option waiting for approval has still taken the "
                       "money out of every other incident's reach, and pretending "
                       "otherwise is how two incidents both spend the same rupee."),
                   payload={"claim_ids": ids, "budget": float(budget),
                            "units": int(units), "supplier_id": supplier_id})
    return ids


async def mark_placed(conn, incident_id: str) -> int:
    """The order exists. Stop counting the hold — `purchase_orders` counts it now."""
    n = await conn.fetchval(
        """with moved as (
             update resource_claims set state = 'placed'
              where incident_id = $1 and state = 'held' returning 1)
           select count(*) from moved""", incident_id) or 0
    return int(n)


async def release_for(conn, incident_id: str, released_reason: str) -> dict[str, float]:
    """Give the reservations back, loudly.

    Called on rejection, on re-plan, and whenever an incident closes without
    spending. The audit event is not decoration: a released claim that nobody
    can see is indistinguishable from a claim that leaked, and the whole point
    of this module is that the ceiling is checkable.
    """
    rows = await conn.fetch(
        """update resource_claims
              set state = 'released', released_at = now(), released_reason = $2
            where incident_id = $1 and state = 'held'
        returning kind, amount, supplier_id""",
        incident_id, released_reason)
    if not rows:
        return {"budget": 0.0, "units": 0.0, "claims": 0}

    freed_budget = float(sum(float(r["amount"]) for r in rows if r["kind"] == "budget"))
    freed_units = float(sum(float(r["amount"]) for r in rows if r["kind"] == "units"))

    await emit(conn, incident_id=incident_id, actor="agent",
               event_type="RESOURCE_RELEASED",
               human_summary=(
                   "Released "
                   + " and ".join(filter(None, [
                       f"Rs {freed_budget:,.0f} of emergency budget" if freed_budget
                       else None,
                       f"{int(freed_units)} reserved units" if freed_units else None]))
                   + f" back to the pool. {released_reason}"),
               agent_reason=(
                   "Every release is written down. A reservation that disappears "
                   "quietly is the same accounting leak as one that was never taken, "
                   "and neither is auditable."),
               payload={"budget": freed_budget, "units": freed_units,
                        "claims": len(rows), "reason": released_reason})
    return {"budget": freed_budget, "units": freed_units, "claims": len(rows)}
