"""The ranking rule must be the rule that is printed, and must be total.

`triage.rank` is a pure function over dicts, so the whole contention-ordering
story is testable without a database, a server or a scenario — which is what
makes it worth trusting under demo pressure.

Run with:  pytest -q
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.triage import RULE, explain_loss, rank          # noqa: E402


def inc(iid, *, hours=None, priority="medium", units=100, value=100_000, **kw):
    return {"incident_id": iid, "hours_to_stop": hours, "priority": priority,
            "units_at_risk": units, "order_value": value, **kw}


def order(items):
    return [i["incident_id"] for i in rank(items)]


# --------------------------------------------------------------------------
# The four comparisons, one at a time
# --------------------------------------------------------------------------


def test_soonest_line_stop_wins():
    """Rule 1. Time is the only irrecoverable resource."""
    assert order([inc("A", hours=40), inc("B", hours=9), inc("C", hours=22)]) \
        == ["B", "C", "A"]


def test_priority_breaks_a_tie_on_time():
    """Rule 2 — and only when rule 1 cannot separate them."""
    assert order([
        inc("LOW", hours=12, priority="low"),
        inc("CRIT", hours=12, priority="critical"),
        inc("HIGH", hours=12, priority="high"),
    ]) == ["CRIT", "HIGH", "LOW"]


def test_units_break_a_tie_on_time_and_priority():
    """Rule 3. A bigger hole is worse when nothing else separates them."""
    assert order([
        inc("SMALL", hours=6, priority="high", units=50),
        inc("BIG", hours=6, priority="high", units=900),
    ]) == ["BIG", "SMALL"]


def test_value_is_the_last_tiebreak_not_the_first():
    """Rule 4, and the reason it is last.

    A cheap critical line must beat an expensive medium one. If value ranked
    higher, the expensive order would take the stock — which is precisely the
    behaviour that makes an automated system indefensible in a review.
    """
    assert order([
        inc("EXPENSIVE_MEDIUM", hours=10, priority="medium", value=9_000_000),
        inc("CHEAP_CRITICAL", hours=10, priority="critical", value=1_000),
    ]) == ["CHEAP_CRITICAL", "EXPENSIVE_MEDIUM"]


# --------------------------------------------------------------------------
# Totality: the properties that stop this failing in front of someone
# --------------------------------------------------------------------------


def test_unknown_deadline_sorts_last_not_first():
    """A missing field must not jump the queue.

    `None` is not an emergency. Sorting unknowns first would let one incomplete
    row outrank a line that is genuinely about to stop.
    """
    assert order([inc("KNOWN", hours=30), inc("UNKNOWN", hours=None)]) \
        == ["KNOWN", "UNKNOWN"]


def test_ordering_is_stable_for_identical_incidents():
    """Two identical incidents keep their arrival order.

    An unstable sort makes the queue reshuffle between refreshes, and an
    operator reasonably reads movement as "something changed".
    """
    same = [inc("FIRST", hours=8), inc("SECOND", hours=8), inc("THIRD", hours=8)]
    assert order(same) == ["FIRST", "SECOND", "THIRD"]
    assert order(same) == ["FIRST", "SECOND", "THIRD"]


def test_rank_is_total_over_missing_fields():
    """Every field absent must still produce an order, not an exception."""
    out = rank([{"incident_id": "BARE"}, {"incident_id": "ALSO_BARE"}])
    assert [o["rank"] for o in out] == [1, 2]
    assert all(o["rank_reason"] for o in out)


def test_empty_queue():
    assert rank([]) == []


def test_every_row_carries_its_rank_and_a_reason():
    out = rank([inc("A", hours=5), inc("B", hours=50)])
    assert [o["rank"] for o in out] == [1, 2]
    assert "5h" in out[0]["rank_reason"] or "stops soonest" in out[0]["rank_reason"].lower()
    # The second must be explained *against the first*, not in isolation.
    assert "A" in out[1]["rank_reason"] or "headroom" in out[1]["rank_reason"]


# --------------------------------------------------------------------------
# The loser is told who won
# --------------------------------------------------------------------------


def test_loss_explanation_names_the_winner_and_the_margin():
    s = explain_loss(
        inc("INC-002", hours=9, priority="critical", component_name="Motor Driver IC"),
        inc("INC-007", hours=18))
    assert "INC-002" in s
    assert "critical" in s
    assert "9h sooner" in s
    assert "Motor Driver IC" in s


def test_loss_explanation_survives_a_winner_with_no_timing():
    s = explain_loss({"incident_id": "INC-002"}, {"incident_id": "INC-007"})
    assert "INC-002" in s
    assert s.endswith(".")


def test_printed_rule_matches_the_implemented_order():
    """The rule on screen and the rule in code are the same four comparisons.

    A stated rule that does not match the behaviour is worse than no stated
    rule, because it is believed.
    """
    assert len(RULE) == 4
    assert "stops" in RULE[0].lower()
    assert "priority" in RULE[1].lower()
    assert "units" in RULE[2].lower()
    assert "value" in RULE[3].lower()
