"""Which problem gets the money.

When two incidents want the last 400 units, something has to choose. This is
that something, and the single most important thing about it is what it is
*not*: it is not the language model.

A model asked to prioritise will produce an answer, and the answer will usually
be reasonable, and nobody will be able to say why it was that answer rather than
a different one — which is exactly the property you cannot have when the output
is "this customer's line stops instead of that one". So the rule is four
comparisons, in code, in one function, printed on screen next to the queue it
produced.

The rule
--------
1. **Hours to line stop, ascending.** The line that stops first wins. Time is
   the only genuinely irrecoverable resource here — money can be found, stock
   can be expedited, an hour of stopped production cannot be un-lost.
2. **Then production-order priority** (critical > high > medium > low). Two
   lines stopping at the same hour are separated by what the business already
   said about them, not by anything this file invents.
3. **Then units at risk.** A bigger hole is worse than a smaller one when
   nothing else distinguishes them.
4. **Then order value.** The last tiebreak, deliberately last: cost is the
   weakest of the four claims on scarce stock, and putting it any higher would
   mean a cheap critical line loses to an expensive medium one.

Every ordering is arguable — that is the point. An arguable rule printed on the
screen can be disagreed with and changed. An unstated one cannot, and a model's
one cannot even be located.

The loser must be told who won
------------------------------
`explain_loss` produces the sentence that goes into a refusal. A rejection that
says "not enough budget" describes an outcome; one that says "lost this stock to
INC-002, which stops a critical line 9 hours sooner" describes a *decision*, and
only the second can be argued with.

NO LLM IN THIS FILE.
"""
from __future__ import annotations

from typing import Any

#: Higher wins. Mirrors the production_orders priority enum.
PRIORITY_RANK = {"critical": 3, "high": 2, "medium": 1, "low": 0}

#: Printed in the UI verbatim. If the code below changes, this changes with it —
#: a stated rule that does not match the behaviour is worse than no rule.
RULE = [
    "Hours until the line stops, soonest first",
    "Then production-order priority (critical → low)",
    "Then units at risk, largest first",
    "Then order value, largest first",
]

RULE_WHY = (
    "Time is the only irrecoverable resource of the four: money can be found and "
    "stock can be expedited, but an hour of stopped production cannot be "
    "un-lost. Value ranks last on purpose — putting it higher would let an "
    "expensive medium-priority order take stock from a cheap critical one."
)


def _key(inc: dict[str, Any]) -> tuple:
    """The sort key. Negated where larger should win, so one ascending sort does it."""
    hours = inc.get("hours_to_stop")
    # An incident with no computed deadline sorts last rather than first. An
    # unknown is not an emergency, and treating it as one lets a missing field
    # jump the queue ahead of a line that is genuinely about to stop.
    hours = float(hours) if hours is not None else float("inf")
    return (
        hours,
        -PRIORITY_RANK.get((inc.get("priority") or "").lower(), 0),
        -int(inc.get("units_at_risk") or 0),
        -float(inc.get("order_value") or 0),
    )


def rank(incidents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Order incidents by the stated rule. Pure, total, and stable.

    Stable matters: two incidents identical on all four comparisons keep the
    order they arrived in, so the queue does not shuffle between refreshes and
    make an operator think something changed.
    """
    ordered = sorted(incidents, key=_key)
    out = []
    for i, inc in enumerate(ordered, start=1):
        out.append({**inc, "rank": i, "rank_reason": _reason(inc, ordered)})
    return out


def _reason(inc: dict[str, Any], ordered: list[dict[str, Any]]) -> str:
    """Why this one sits where it does, said against the one above it."""
    idx = ordered.index(inc)
    if idx == 0:
        h = inc.get("hours_to_stop")
        if h is None:
            return "First in the queue — nothing else has a computed deadline."
        return (f"Stops soonest — {float(h):.0f}h until the line halts"
                + (f", {inc['priority']} priority." if inc.get("priority") else "."))
    above = ordered[idx - 1]
    ah, bh = above.get("hours_to_stop"), inc.get("hours_to_stop")
    if ah is not None and bh is not None and float(bh) > float(ah):
        return (f"{float(bh) - float(ah):.0f}h more headroom than "
                f"{above.get('incident_id') or 'the one above'}.")
    ap = PRIORITY_RANK.get((above.get("priority") or "").lower(), 0)
    bp = PRIORITY_RANK.get((inc.get("priority") or "").lower(), 0)
    if bp < ap:
        return (f"Same timing as {above.get('incident_id') or 'the one above'}, "
                f"lower priority ({inc.get('priority')} vs {above.get('priority')}).")
    au = int(above.get("units_at_risk") or 0)
    bu = int(inc.get("units_at_risk") or 0)
    if bu < au:
        return f"Same timing and priority, smaller hole ({bu} units vs {au})."
    return "Same on every comparison — order preserved as received."


def explain_loss(winner: dict[str, Any], loser: dict[str, Any] | None = None) -> str:
    """The sentence a refusal carries when something else took the resource.

    A refusal that cannot name the winner is not an explanation, it is an
    outcome. This is the difference between "the budget ran out" and "INC-002
    took it, and here is why that was right".
    """
    who = winner.get("incident_id") or "another incident"
    bits = []
    if winner.get("priority"):
        bits.append(f"a {winner['priority']} line")
    else:
        bits.append("another line")

    wh, lh = winner.get("hours_to_stop"), (loser or {}).get("hours_to_stop")
    if wh is not None and lh is not None:
        gap = float(lh) - float(wh)
        if gap > 0:
            bits.append(f"which stops {gap:.0f}h sooner")
    elif wh is not None:
        bits.append(f"which stops in {float(wh):.0f}h")

    if winner.get("component_name"):
        bits.append(f"on {winner['component_name']}")

    return f"Lost this to {who} — " + ", ".join(bits) + "."


#: The SQL that produces the input to `rank()`. Kept here beside the rule it
#: feeds so the two cannot drift apart in separate files.
QUEUE_SQL = """
select i.id as incident_id,
       i.severity::text as severity,
       i.status::text   as status,
       i.title,
       c.display_name   as component_name,
       po.id            as production_order_id,
       po.priority::text as priority,
       po.oem_customer,
       greatest(0, extract(epoch from (po.deadline - now())) / 3600.0) as hours_to_stop,
       greatest(0, po.units_planned * po.component_per_unit
                   - inv.usable_stock + inv.safety_stock)              as units_at_risk,
       (po.units_planned * po.component_per_unit)
         * coalesce(c.baseline_unit_price, 0)                          as order_value
  from incidents i
  left join components c on c.id = i.component_id
  left join lateral (
        select p.* from production_orders p
         where p.required_component = i.component_id and not p.is_on_hold
         order by p.deadline limit 1
  ) po on true
  left join inventory inv on inv.component_id = i.component_id
                         and inv.warehouse_id = po.warehouse_id
 where i.status not in ('resolved','failed')
   and ($1::bigint is null or i.scenario_run_id = $1)
"""
