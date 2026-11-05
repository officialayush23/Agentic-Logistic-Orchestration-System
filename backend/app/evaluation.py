"""Evaluate one run against explicit criteria, from that run's own artefacts.

Nothing here is pre-seeded and nothing is hardcoded to pass. Every criterion is
recomputed from what the run actually produced, so a run that was never executed
comes back **not evaluated** rather than **failed** — those are different claims
and only one of them is honest.

Three categories, because judges ask three different questions:

    constraint — did it ever break a hard rule? (any failure is a failure)
    execution  — did it actually do the work end to end?
    handoff    — did it stop in the right places, and resume correctly?

A criterion may return `passed=None`, meaning *not applicable to this run*. A
scenario with no contradiction in it cannot be marked down for failing to catch
one, and marking it "passed" would be equally dishonest.

NO LLM IN THIS FILE.
"""
from __future__ import annotations

import json
from typing import Any

from .core import APPROVAL_THRESHOLD_INR


def _payload(v: Any) -> dict:
    if isinstance(v, str):
        try:
            return json.loads(v)
        except json.JSONDecodeError:
            return {}
    return v or {}


async def evaluate(conn, run_id: int) -> dict[str, Any]:
    """Recompute every criterion for one run and store the result."""
    events = await conn.fetch(
        """select sequence, event_type, actor, human_summary, technical_payload
             from audit_events where scenario_run_id=$1 order by sequence""", run_id)
    if not events:
        return {"run_id": run_id, "evaluated": False,
                "reason": "This run produced no events. Nothing to evaluate."}

    by_type: dict[str, list[dict]] = {}
    for e in events:
        by_type.setdefault(e["event_type"], []).append(
            {**dict(e), "technical_payload": _payload(e["technical_payload"])})

    # ------------------------------------------------------------------------
    # Two sources, two lifetimes — and mixing them is what made old verdicts rot.
    #
    # `audit_events` is append-only and survives a world reset. `incidents`,
    # `recovery_plans`, `approvals` and `purchase_orders` are truncated by
    # seed.sql every time the world is re-seeded. Evaluating a finished run
    # therefore read a full audit trail against emptied tables and reported
    # "the agent opened an incident by itself — incidents: []" and "no recovery
    # plan was produced" about a run whose own log shows OPTION_SELECTED and a
    # purchase order. Worse, the verdict *changed* every time anyone reset.
    #
    # So the audit log is the authority for did-this-happen, and the tables are
    # enrichment only. A run's verdict is now a fact about that run, not about
    # what the database happens to contain when you open the page.
    # ------------------------------------------------------------------------
    incidents = await conn.fetch(
        "select * from incidents where scenario_run_id=$1", run_id)
    plans = await conn.fetch(
        "select * from recovery_plans where scenario_run_id=$1", run_id)
    approvals = await conn.fetch(
        "select * from approvals where scenario_run_id=$1", run_id)

    #: Incident ids this run's own log says were opened, whether or not the row
    #: still exists.
    logged_incident_ids = sorted({
        e["technical_payload"].get("incident_id") or e["incident_id"]
        for e in by_type.get("INCIDENT_OPENED", [])} - {None})
    #: Plans this run's own log says were chosen.
    selected = by_type.get("OPTION_SELECTED", [])
    #: True when the operational tables have been re-seeded out from under a run
    #: that plainly did the work. Used to say "not verifiable" instead of lying
    #: in either direction.
    world_reseeded = bool(selected or logged_incident_ids) and not (
        incidents or plans)

    def plan_labels() -> list[str]:
        if plans:
            return [p["label"] for p in plans]
        return [(e["technical_payload"].get("label")
                 or (e["human_summary"] or "").replace("Recovery plan: ", "").rstrip("."))
                for e in selected]

    def plan_costs() -> list[float]:
        if plans:
            return [float(p["total_cost"] or 0) for p in plans]
        return [float(e["technical_payload"].get("total_cost") or 0) for e in selected]

    # Orders this run actually raised, checked against the rules that bind them.
    pos = await conn.fetch(
        """select p.id, p.quantity, p.mode::text as mode,
                  c.required_certifications, c.is_hazmat,
                  se.certifications, sc.min_order_quantity
             from purchase_orders p
             join components c on c.id = p.component_id
             left join supplier_effective se on se.supplier_id = p.supplier_id
             left join supplier_catalog sc on sc.supplier_id = p.supplier_id
                                          and sc.component_id = p.component_id
            where p.created_by_agent and p.incident_id = any($1::text[])""",
        # Fall back to the ids in the log so a wiped `incidents` table does not
        # silently narrow this to "no orders, therefore no violations".
        ([i["id"] for i in incidents] or logged_incident_ids) or [""])

    results: list[dict[str, Any]] = []

    def add(criterion, category, passed, detail, evidence=None):
        results.append({"criterion": criterion, "category": category,
                        "passed": passed, "detail": detail,
                        "evidence": evidence or {}})

    # ---------------------------------------------------------- constraints ---
    cert_fail, moq_fail, hazmat_fail = [], [], []
    for p in pos:
        need, have = set(p["required_certifications"] or []), set(p["certifications"] or [])
        if need - have:
            cert_fail.append({"po": p["id"], "missing": sorted(need - have)})
        if p["min_order_quantity"] and p["quantity"] < p["min_order_quantity"]:
            moq_fail.append({"po": p["id"], "ordered": p["quantity"],
                             "minimum": p["min_order_quantity"]})
        if p["is_hazmat"] and (p["mode"] or "").upper() == "AIR":
            hazmat_fail.append({"po": p["id"]})

    rejections = by_type.get("OPTION_REJECTED", [])
    rejected_rules = {r["technical_payload"].get("constraint") for r in rejections}

    # `purchase_orders` is re-seeded too. Claiming "every order was compliant"
    # when the orders have been deleted is a pass earned by amnesia, so say so
    # rather than banking it.
    reseeded_note = (" The orders this run raised were cleared by a later world "
                     "reset, so this cannot be re-checked against them."
                     if world_reseeded and not pos else "")
    unverifiable = world_reseeded and not pos

    add("No uncertified supplier was used", "constraint",
        None if unverifiable else not cert_fail,
        ("Every order went to a supplier holding the certifications the component "
         "requires." if not cert_fail else
         f"{len(cert_fail)} order(s) used an uncertified supplier.") + reseeded_note,
        {"violations": cert_fail, "orders_checked": len(pos),
         "rejected_for_this_rule": "REQUIRED_CERTIFICATION" in rejected_rules})

    add("No minimum-order rule was breached", "constraint",
        None if unverifiable else not moq_fail,
        ("No order fell below a supplier's stated minimum." if not moq_fail
         else f"{len(moq_fail)} order(s) below the supplier minimum.") + reseeded_note,
        {"violations": moq_fail, "orders_checked": len(pos),
         "rejected_for_this_rule": "MIN_ORDER_QUANTITY" in rejected_rules})

    hazmat_in_play = any(p["is_hazmat"] for p in pos) or "HAZMAT_NO_AIR" in rejected_rules
    add("Hazmat was never routed by air", "constraint",
        None if not hazmat_in_play else not hazmat_fail,
        "No hazmat component was involved in this run." if not hazmat_in_play
        else ("Hazmat stayed off air freight." if not hazmat_fail
              else "Hazmat was routed by air — prohibited, not merely expensive."),
        {"violations": hazmat_fail})

    # This one used to fail the entire run whenever the count was zero — and
    # zero is the correct, honest answer whenever the solver never got as far as
    # scoring options, or scored them and found nothing that broke a rule. A run
    # where the agent behaved perfectly was being marked down on a hard
    # constraint for having nothing to refuse.
    #
    # The criterion is really "when you refused something, did you write down
    # why". If no option was ever evaluated, the situation never arose and the
    # honest verdict is 'not applicable' — the same treatment hazmat and
    # contradiction already get. If options *were* evaluated and every refusal
    # came with its rule, that is a pass.
    scored_anything = bool(rejections or selected or by_type.get("OPTIONS_SCORED"))
    unreasoned = [r for r in rejections if not r["technical_payload"].get("constraint")]
    add("Refusals were recorded with reasons", "constraint",
        None if not scored_anything else not unreasoned,
        "No option was ever scored in this run, so there was nothing to refuse."
        if not scored_anything
        else (f"{len(rejections)} option(s) refused, each with the rule that stopped it."
              if rejections and not unreasoned
              else f"{len(unreasoned)} refusal(s) were recorded without naming the rule."
              if unreasoned
              else "Options were scored and none broke a hard rule, so nothing was "
                   "refused."),
        {"count": len(rejections), "without_reason": len(unreasoned),
         "options_were_scored": scored_anything,
         "rules": sorted(r for r in rejected_rules if r)})

    # ------------------------------------------------------------ execution ---
    add("Disruption was detected without being asked", "execution",
        bool(by_type.get("INCIDENT_OPENED")),
        "The agent opened an incident by itself." if by_type.get("INCIDENT_OPENED")
        else "No incident was opened for this run.",
        # Read the ids from the log, not the table. The table is emptied by a
        # world reset, which is how this criterion came to pass while listing
        # no incidents at all.
        {"incidents": [i["id"] for i in incidents] or logged_incident_ids})

    add("Production impact was quantified", "execution",
        bool(by_type.get("RISK_ASSESSED")),
        "Coverage was computed in hours against the deadline."
        if by_type.get("RISK_ASSESSED") else "No risk assessment recorded.")

    add("Physical stock was verified, not assumed", "execution",
        bool(by_type.get("WAREHOUSE_TASK_CREATED") or by_type.get("PHYSICAL_COUNT_CONFIRMED")),
        "The agent asked the floor rather than trusting the ERP."
        if by_type.get("WAREHOUSE_TASK_CREATED") else "No physical verification was requested.")

    add("Alternate suppliers were contacted", "execution",
        bool(by_type.get("MESSAGE_SENT")),
        f"{len(by_type.get('MESSAGE_SENT', []))} message(s) sent."
        if by_type.get("MESSAGE_SENT") else "No supplier was contacted.")

    add("Replies were interpreted into facts", "execution",
        bool(by_type.get("MESSAGE_INTERPRETED")),
        f"{len(by_type.get('MESSAGE_INTERPRETED', []))} reply(ies) read into structured "
        f"fields." if by_type.get("MESSAGE_INTERPRETED") else "No reply was interpreted.")

    # OPTION_SELECTED in this run's own log is the proof. The `recovery_plans`
    # row is the same fact stored somewhere deletable.
    made_plan = bool(plans or selected)
    add("A recovery plan was produced", "execution", made_plan,
        (f"{len(plans) or len(selected)} plan(s) generated and scored."
         + (" The plan rows were cleared by a later world reset; this is read "
            "from the run's own audit log." if world_reseeded else ""))
        if made_plan else "No recovery plan was produced.",
        {"labels": plan_labels(), "from_audit_log": not plans and bool(selected)})

    # `shipment_tracking` is re-seeded on reset, so asking it "was a
    # contradiction possible" answers for the world that exists now, not the
    # world this run happened in. A run that caught a contradiction could be
    # marked 'not applicable' afterwards. The run's own log settles it: a claim
    # the injector planted is in the log whether or not the row survives.
    caught = len(by_type.get("CLAIM_CONTRADICTED", []))
    planted = len([e for e in by_type.get("DISRUPTION_INJECTED", [])
                   if "claim" in (e["technical_payload"].get("type") or "")])
    contradiction_possible = caught or planted or (await conn.fetchval(
        """select count(*) from shipment_tracking
            where supplier_claim in ('dispatched','in_transit')
              and tracking_status in ('label_created_no_pickup','not_shipped')""") or 0)
    add("Supplier claims were verified against carrier data", "constraint",
        None if not contradiction_possible else caught > 0,
        "No supplier claim in this run conflicted with tracking."
        if not contradiction_possible
        else (f"{caught} contradiction(s) caught." if caught
              else "A supplier claim conflicted with tracking and was not caught."),
        {"present": int(contradiction_possible), "caught": caught})

    # -------------------------------------------------------------- handoff ---
    over_authority = ([p for p in plans
                       if float(p["total_cost"] or 0) > APPROVAL_THRESHOLD_INR
                       or p["option_kind"] == "reschedule_other"]
                      if plans else
                      [c for c in plan_costs() if c > APPROVAL_THRESHOLD_INR])
    asked = by_type.get("APPROVAL_REQUIRED", [])

    add("It stopped when it crossed its authority", "handoff",
        None if not over_authority else bool(asked),
        "Nothing in this run crossed the authority limit." if not over_authority
        else ("The agent halted and asked before acting." if asked
              else "A plan crossed the limit and the agent did not stop."),
        {"over_authority": len(over_authority), "escalations": len(asked),
         "threshold": APPROVAL_THRESHOLD_INR})

    add("It did not stop unnecessarily", "handoff",
        None if not asked else len(asked) <= max(1, len(over_authority)),
        "No escalation raised." if not asked
        else f"{len(asked)} escalation(s) for {len(over_authority)} plan(s) that "
             f"genuinely needed one.")

    decided = by_type.get("APPROVAL_DECIDED", [])
    add("It resumed after the human decided", "handoff",
        None if not decided else bool(
            by_type.get("ERP_UPDATED") or by_type.get("OPTION_SELECTED")),
        "No approval was decided in this run." if not decided
        else "The agent picked the work back up after the decision.")

    add("Ambiguity was handed over rather than guessed", "handoff",
        None if not by_type.get("HUMAN_INPUT_REQUIRED") else True,
        "No reply was too ambiguous to act on."
        if not by_type.get("HUMAN_INPUT_REQUIRED")
        else f"{len(by_type['HUMAN_INPUT_REQUIRED'])} reply(ies) were escalated instead "
             f"of being guessed at.")

    # ------------------------------------------------------------- persist ---
    for r in results:
        await conn.execute(
            """insert into evaluation_results
                 (scenario_run_id, criterion, category, passed, detail, evidence)
               values ($1,$2,$3,$4,$5,$6::jsonb)
               on conflict (scenario_run_id, criterion) do update set
                 passed=excluded.passed, detail=excluded.detail,
                 evidence=excluded.evidence, created_at=now()""",
            run_id, r["criterion"], r["category"], r["passed"], r["detail"],
            json.dumps(r["evidence"], default=str))

    applicable = [r for r in results if r["passed"] is not None]
    passed = [r for r in applicable if r["passed"]]
    blocking = [r for r in applicable
                if r["category"] == "constraint" and not r["passed"]]

    return {
        "run_id": run_id,
        "evaluated": True,
        "criteria": results,
        "passed": len(passed),
        "applicable": len(applicable),
        "not_applicable": len(results) - len(applicable),
        "score_pct": round(100.0 * len(passed) / len(applicable), 1) if applicable else None,
        # One broken constraint fails the run regardless of everything else.
        "verdict": "FAILED" if blocking else ("PASSED" if applicable else "NOT EVALUATED"),
        "blocking_failures": [r["criterion"] for r in blocking],
        "note": ("A constraint failure fails the run whatever else it scored. "
                 "'Not applicable' means this run never presented that situation — "
                 "it is not a pass and not a failure."),
    }
