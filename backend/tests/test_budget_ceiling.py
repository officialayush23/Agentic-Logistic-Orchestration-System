"""The emergency budget must be a ceiling, including when two incidents race.

This is the test the bug was hiding behind. `solver.solve` is a pure function
over dicts, so the whole contention story can be proved without a database, a
running server or a scenario — which is what makes it worth having under demo
pressure.

Run with:  pytest -q
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core import EMERGENCY_BUDGET_INR          # noqa: E402
from app.solver import solve                        # noqa: E402
from datetime import datetime, timedelta, timezone  # noqa: E402


DEADLINE = datetime.now(timezone.utc) + timedelta(days=6)


def _candidate(sid="SUP-42", *, price=300.0, qty=1000, freight=5000.0,
               moq=1, certs=("AEC-Q100",), mode="ROAD", lead=2, transit=1):
    return {
        "supplier_id": sid, "supplier_name": f"Supplier {sid}",
        "unit_price": price, "available_quantity": qty, "min_order_quantity": moq,
        "certifications": list(certs), "mode": mode,
        "lead_time_days": lead, "transit_days": transit, "freight_cost": freight,
        "derived_reliability": 0.9, "effective_reliability": 0.9, "quality_score": 0.9,
    }


def _solve(**kw):
    base = dict(
        candidates=[_candidate()], shortfall=500, deadline=DEADLINE,
        required_certs=["AEC-Q100"], is_hazmat=False, priority="high",
        baseline_unit_price=250.0,
    )
    base.update(kw)
    return solve(**base)


# --------------------------------------------------------------------------
# The leak itself
# --------------------------------------------------------------------------


def test_held_budget_counts_against_the_ceiling():
    """Money another incident has committed to is not available to this one.

    Before `resource_claims`, `budget_spent` counted only *placed* purchase
    orders. Two incidents each read the full ceiling, each approved most of it,
    and both passed OVER_BUDGET.
    """
    # Nothing placed, but another incident holds nearly the whole budget.
    held = EMERGENCY_BUDGET_INR - 1000
    result = _solve(budget_spent=0.0, budget_held=held,
                    budget_holders=[{"incident_id": "INC-002", "amount": held,
                                     "severity": "critical",
                                     "component_name": "Motor Driver IC"}])

    assert result["budget"]["left"] == pytest.approx(1000.0)
    # A 500-unit order at Rs 300 plus freight cannot fit in Rs 1,000.
    assert result["chosen"] is None or result["chosen"]["total_cost"] <= 1000.0
    kinds = {r["constraint"] for r in result["rejections"]}
    assert "OVER_BUDGET" in kinds


def test_over_budget_rejection_names_who_holds_the_money():
    """A refusal that cannot name the winner is an outcome, not an explanation."""
    held = EMERGENCY_BUDGET_INR - 1000
    result = _solve(budget_spent=0.0, budget_held=held,
                    budget_holders=[{"incident_id": "INC-002", "amount": held,
                                     "severity": "critical",
                                     "component_name": "Motor Driver IC"}])
    over = [r for r in result["rejections"] if r["constraint"] == "OVER_BUDGET"]
    assert over, "expected an OVER_BUDGET rejection"
    reason = over[0]["human_reason"]
    assert "INC-002" in reason
    assert "critical" in reason
    assert over[0]["detail"]["held_by"] == ["INC-002"]


def test_two_incidents_cannot_both_fit_under_one_ceiling():
    """The property that matters: placed + held never exceeds the ceiling.

    Incident A commits most of the budget. Incident B then plans against what is
    genuinely left. Whatever B chooses, the two together must fit.
    """
    a = _solve(budget_spent=0.0, budget_held=0.0)
    assert a["chosen"] is not None
    a_cost = float(a["chosen"]["total_cost"])

    b = _solve(budget_spent=0.0, budget_held=a_cost,
               budget_holders=[{"incident_id": "INC-A", "amount": a_cost}])
    b_cost = float(b["chosen"]["total_cost"]) if b["chosen"] else 0.0

    assert a_cost + b_cost <= EMERGENCY_BUDGET_INR, (
        f"two incidents committed Rs {a_cost + b_cost:,.0f} against a "
        f"Rs {EMERGENCY_BUDGET_INR:,.0f} ceiling")


# --------------------------------------------------------------------------
# The same hole, in units
# --------------------------------------------------------------------------


def test_units_held_by_another_incident_are_not_available():
    """Two incidents must not allocate the same stock from the same supplier."""
    result = _solve(
        candidates=[_candidate("SUP-42", qty=800)],
        shortfall=800,
        held_units={"SUP-42": {"units": 800, "incident_id": "INC-002"}})

    kinds = {r["constraint"] for r in result["rejections"]}
    assert "UNITS_CLAIMED" in kinds
    claimed = [r for r in result["rejections"] if r["constraint"] == "UNITS_CLAIMED"][0]
    assert "INC-002" in claimed["human_reason"]
    assert claimed["detail"]["held_by"] == "INC-002"


def test_partial_unit_hold_shrinks_availability_rather_than_removing_it():
    """A supplier half-claimed is still a supplier. It just has less to sell."""
    result = _solve(
        candidates=[_candidate("SUP-42", qty=1000)],
        shortfall=400,
        held_units={"SUP-42": {"units": 700, "incident_id": "INC-002"}})

    # 1000 - 700 = 300 left, which is short of the 400 needed but not nothing:
    # the option should survive the filter and be scored as a partial cover.
    assert "UNITS_CLAIMED" not in {r["constraint"] for r in result["rejections"]}
    assert result["chosen"] is not None
    assert result["chosen"]["units_covered"] <= 300


# --------------------------------------------------------------------------
# Nothing changes when there is no contention
# --------------------------------------------------------------------------


def test_no_claims_behaves_exactly_as_before():
    """The single-incident path — every scenario we ship — must be untouched."""
    result = _solve(budget_spent=0.0, budget_held=0.0)
    assert result["chosen"] is not None
    assert result["budget"]["held"] == 0.0
    assert result["budget"]["left"] == pytest.approx(float(EMERGENCY_BUDGET_INR))
    assert "UNITS_CLAIMED" not in {r["constraint"] for r in result["rejections"]}
