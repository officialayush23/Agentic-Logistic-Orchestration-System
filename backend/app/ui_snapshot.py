"""One call that returns everything the UI renders, in the UI's own shapes
(src/app/data/types.ts). Each section is built independently: a section that
fails returns [] and the UI keeps its sample data for that section only.
"""
from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any

from . import guards
from .finance_agent import AUTHORITY_LIMIT_USD, INR_PER_USD

log = logging.getLogger("disruptionops.snapshot")

HEALTH = {"critical": "critical", "high": "at_risk"}
STAGE = {"open": "detected", "investigating": "investigating", "planning": "investigating",
         "awaiting_approval": "awaiting_approval", "executing": "funds_held", "verifying": "funds_held",
         "resolved": "settled", "failed": "clawed_back"}
SHIP = {"open": "booked", "in_transit": "in_transit", "delayed": "delayed", "delivered": "delivered",
        "received": "delivered", "cancelled": "not_shipped"}


def _iso(d) -> str | None:
    return d.isoformat() if d else None


def _usd(inr) -> float:
    return round(float(inr or 0) / INR_PER_USD, 2)


async def _section(name: str, fn, conn) -> list[dict]:
    try:
        return await fn(conn)
    except Exception as exc:  # noqa: BLE001
        log.warning("snapshot section %s failed: %s", name, exc)
        return []


async def _components(conn):
    rows = await conn.fetch("select * from components order by id")
    return [{"id": r["id"], "name": r.get("display_name") or r["name"], "partNumber": r.get("part_number") or r["id"],
             "category": "electronics", "hazmat": r["is_hazmat"], "certifications": list(r["required_certifications"] or []),
             "unitPriceUsd": _usd(r["baseline_unit_price"])} for r in map(dict, rows)]


async def _suppliers(conn):
    rows = await conn.fetch(
        """select s.*,
                  (select count(*) from shipment_tracking t join purchase_orders p on p.id=t.po_id
                    where p.supplier_id=s.id and t.supplier_claim is not null) as checked,
                  (select count(*) from reliability_events e where e.supplier_id=s.id and e.kind='contradiction') as lied,
                  (select min(l.transit_days) from supplier_lanes l where l.supplier_id=s.id) as lead
             from suppliers s order by s.id""")
    return [{"id": r["id"], "name": r.get("legal_name") or r["name"], "city": r["city"], "country": r["country"],
             "lat": float(r.get("lat") or 0), "lng": float(r.get("lng") or 0),
             "reliability": int(round(float(r["reliability_score"]) * 100)),
             "claimsChecked": int(r["checked"] or 0), "claimsContradicted": int(r["lied"] or 0),
             "paypalAccount": r.get("paypal_email_verified") or r.get("paypal_email") or "",
             "certified": list(r["certifications"] or []), "leadDays": int(r["lead"] or 7)}
            for r in map(dict, rows)]


async def _projects(conn):
    rows = await conn.fetch(
        """select p.*,
                  array(select id from production_orders o where o.project_id=p.id) as orders,
                  (select max(priority::text) from production_orders o where o.project_id=p.id) as prio,
                  (select coalesce(sum(amount_usd),0) from payments x join purchase_orders q on q.id=x.po_id
                     where q.project_id=p.id and not x.archived) as committed,
                  (select coalesce(sum(amount_usd),0) from payments x join purchase_orders q on q.id=x.po_id
                     where q.project_id=p.id and not x.archived and x.state in ('funds_held','awaiting_approval')) as held,
                  (select coalesce(sum(coalesce(captured_usd,amount_usd)),0) from payments x join purchase_orders q on q.id=x.po_id
                     where q.project_id=p.id and not x.archived and x.state in ('funds_released','retention_held','payout_sent')) as released,
                  (select coalesce(sum(amount_usd),0) from payments x join purchase_orders q on q.id=x.po_id
                     where q.project_id=p.id and not x.archived and x.state in ('hold_voided','refunded')) as recovered,
                  (select count(*) from incidents i join production_orders o on o.required_component=i.component_id
                     where o.project_id=p.id and i.status not in ('resolved','failed')) as open_inc
             from projects p order by p.due_at nulls last""")
    out = []
    for r in map(dict, rows):
        n_open = int(r["open_inc"] or 0)
        out.append({"id": r["id"], "name": r["name"], "customerId": r["customer"], "product": r["product"],
                    "units": r["units"], "dueAt": _iso(r["due_at"]), "originalDueAt": _iso(r["due_at"]),
                    "health": "critical" if n_open > 1 else "at_risk" if n_open else "on_track",
                    "priority": r["prio"] or "medium", "productionOrders": list(r["orders"] or []),
                    "materialsSecured": 1.0 if not n_open else 0.7,
                    "committedUsd": float(r["committed"]), "heldUsd": float(r["held"]),
                    "releasedUsd": float(r["released"]), "recoveredUsd": float(r["recovered"]),
                    "openIncidents": n_open, "owner": r.get("owner") or "", "summary": r.get("summary") or ""})
    return out


async def _customers(conn):
    rows = await conn.fetch("select distinct customer, customer_city from projects")
    return [{"id": r["customer"], "name": r["customer"], "city": r["customer_city"] or "", "tier": "key"} for r in rows]


async def _pos(conn):
    rows = await conn.fetch(
        """select q.*, coalesce(q.project_id, (select o.project_id from production_orders o
                                               where o.required_component=q.component_id and o.project_id is not null
                                               limit 1)) as proj,
                  (select state from payments x where x.po_id=q.id and not x.archived order by id desc limit 1) as fin
             from purchase_orders q order by q.created_at desc limit 200""")
    out = []
    for r in map(dict, rows):
        out.append({"id": r["id"], "projectId": r["proj"] or "", "componentId": r["component_id"],
                    "supplierId": r["supplier_id"], "qty": r["quantity"], "unitPriceUsd": _usd(r["unit_price"]),
                    "totalUsd": _usd(r["total_value"]), "mode": str(r["mode"]), "createdAt": _iso(r["created_at"]),
                    "promisedAt": _iso(r.get("promised_date") or r["expected_delivery"]),
                    "etaAt": _iso(r.get("revised_date") or r["expected_delivery"]),
                    "createdByAgent": r["created_by_agent"], "financial": r["fin"] or "not_started",
                    "confidence": 40 if str(r["status"]) == "delayed" else 85,
                    **({"incidentId": r["incident_id"]} if r["incident_id"] else {})})
    return out


async def _shipments(conn):
    rows = await conn.fetch(
        """select q.id, q.status, q.expected_delivery, q.created_at, t.supplier_claim, t.tracking_status,
                  (select progress from shipment_positions s where s.po_id=q.id order by id desc limit 1) as prog
             from purchase_orders q left join shipment_tracking t on t.po_id=q.id""")
    out = []
    for r in map(dict, rows):
        claim, carrier = r["supplier_claim"] or "", r["tracking_status"] or ""
        mismatch = bool(claim and carrier and "dispatch" in claim.lower() and "no pickup" in carrier.lower())
        out.append({"poId": r["id"], "status": "claim_mismatch" if mismatch else SHIP.get(str(r["status"]), "in_transit"),
                    "supplierClaim": claim, "carrierStatus": carrier, "carrier": "", "tracking": "",
                    "progress": float(r["prog"] or 0), "promisedFrom": _iso(r["created_at"]),
                    "promisedTo": _iso(r["expected_delivery"])})
    return out


async def _payments(conn):
    rows = await conn.fetch(
        """select x.*, q.project_id from payments x left join purchase_orders q on q.id=x.po_id
            where not x.archived order by x.id desc limit 200""")
    evs = await conn.fetch("select * from payment_events order by id")
    by: dict[int, list] = {}
    for e in map(dict, evs):
        by.setdefault(e["payment_id"], []).append(
            {"at": _iso(e.get("created_at") or e.get("at")), "type": e["type"], "detail": e.get("detail") or "",
             "api": e.get("api") or ""})
    return [{"id": r.get("paypal_order_id") or f"PAY-{r['id']}", "poId": r["po_id"], "projectId": r["project_id"] or "",
             "supplierId": r["supplier_id"] or "", "amountUsd": float(r["amount_usd"]), "state": r["state"],
             "authorizationId": r.get("authorization_id"), "captureId": r.get("capture_id"),
             "invoiceNumber": r.get("invoice_number"), "match": r.get("match") or "pending",
             "needsApproval": r["needs_approval"], "events": by.get(r["id"], [])} for r in map(dict, rows)]


async def _incidents(conn):
    rows = await conn.fetch(
        """select i.*, (select project_id from production_orders o where o.required_component=i.component_id
                         and o.project_id is not null limit 1) as proj
             from incidents i order by opened_at desc limit 50""")
    out = []
    for r in map(dict, rows):
        steps = await conn.fetch(
            """select ts, human_summary, technical_payload from audit_events
                where incident_id=$1 and event_type in ('AGENT_STEP','GUARD_BLOCK','GUARD_ADJUST','GUARD_ESCALATE',
                      'PAYPAL_FUNDS_HELD','PAYPAL_HOLD_VOIDED','PAYPAL_FUNDS_RELEASED','PAYPAL_REFUNDED','APPROVAL_DECIDED')
                order by sequence limit 40""", r["id"])
        out.append({"id": r["id"], "projectId": r["proj"] or "", "title": r["title"] or r["id"],
                    "scenario": (r.get("details") or {}).get("trigger", "") if isinstance(r.get("details"), dict) else "",
                    "severity": str(r["severity"]), "stage": STAGE.get(str(r["status"]), "investigating"),
                    "openedAt": _iso(r["opened_at"]), "supplierId": "", "poId": r.get("source_po_id") or "",
                    "amountUsd": 0, "options": [],
                    "steps": [{"at": _iso(s["ts"]), "label": s["human_summary"],
                               "status": ((s["technical_payload"] or {}).get("status") if isinstance(s["technical_payload"], dict) else None) or "done",
                               "by": "paypal" if "PayPal" in (s["human_summary"] or "") else "agent"} for s in steps]})
    return out


async def _approvals(conn):
    rows = await conn.fetch(
        """select a.*, x.po_id, x.amount_usd, q.project_id from release_approvals a
             join payments x on x.id=a.payment_id left join purchase_orders q on q.id=x.po_id
            order by a.id desc limit 30""")
    return [{"id": f"APR-{r['id']}", "incidentId": r.get("incident_id") or "", "projectId": r["project_id"] or "",
             "poId": r["po_id"], "amountUsd": float(r["amount_usd"]), "limitUsd": AUTHORITY_LIMIT_USD,
             "reason": r.get("reason") or "", "requestedAt": _iso(r.get("created_at")),
             "expiresAt": _iso(r.get("expires_at") or (r.get("created_at") and r["created_at"] + timedelta(hours=24))),
             "state": r["state"] if r["state"] in ("pending", "approved", "rejected") else "rejected"}
            for r in map(dict, rows)]


async def _feed(conn):
    rows = await conn.fetch(
        """select sequence, ts, actor, event_type, human_summary, incident_id from audit_events
            order by sequence desc limit 40""")
    def kind(r):
        et = r["event_type"]
        return "paypal" if et.startswith("PAYPAL") else "human" if r["actor"] == "human" else \
            "warehouse" if r["actor"] == "warehouse" else "email" if "MESSAGE" in et else "agent"
    def tone(r):
        et = r["event_type"]
        return "crit" if any(k in et for k in ("CONTRADICT", "BLOCK", "FAILED", "VOIDED")) else \
            "good" if any(k in et for k in ("RELEASED", "RESOLVED", "HELD")) else "violet"
    return [{"id": str(r["sequence"]), "at": _iso(r["ts"]), "kind": kind(r), "tone": tone(r),
             "title": r["event_type"].replace("_", " ").title(), "body": r["human_summary"] or ""} for r in rows]


async def _emails(conn):
    rows = await conn.fetch(
        """select m.*, (select project_id from production_orders o join incidents i on i.component_id=o.required_component
                         where i.id=m.incident_id and o.project_id is not null limit 1) as proj
             from messages m order by sent_at desc limit 60""")
    return [{"id": str(r["id"]), "threadId": r["incident_id"] or str(r["id"]), "projectId": r["proj"] or "",
             "supplierId": r["supplier_id"] or "", "direction": str(r["direction"]),
             "from": r["supplier_id"] or "agent", "subject": r["subject"] or "", "body": r["body"],
             "at": _iso(r["sent_at"])} for r in map(dict, rows)]


async def _bom(conn):
    rows = await conn.fetch(
        """select o.project_id, o.required_component, o.component_per_unit, o.units_planned,
                  coalesce(i.usable_stock,0) as on_hand
             from production_orders o left join inventory i on i.component_id=o.required_component
            where o.project_id is not null""")
    return [{"projectId": r["project_id"], "componentId": r["required_component"], "perUnit": r["component_per_unit"],
             "required": r["component_per_unit"] * r["units_planned"], "onHand": int(r["on_hand"])} for r in rows]


async def _timers(conn):
    rows = await conn.fetch(
        """select b.*, c.display_name from bom_lines b left join components c on c.id=b.component_id""")
    out = []
    for r in map(dict, rows):
        order_by = r["need_by"] - timedelta(days=r["lead_time_days"] + r["transit_days"] + r["buffer_days"])
        out.append({"projectId": r["project_id"], "componentId": r["component_id"], "name": r["display_name"],
                    "qty": r["qty"], "needBy": _iso(r["need_by"]), "orderBy": _iso(order_by),
                    "orderedPoId": r["ordered_po_id"], "approvedAlternates": r["approved_alternates"]})
    return out


async def _envelopes(conn):
    rows = await conn.fetch("select * from budget_envelopes order by project_id")
    return [{"projectId": r["project_id"], "category": r["category"], "windowStart": _iso(r["window_start"]),
             "windowEnd": _iso(r["window_end"]), "capUsd": float(r["cap_usd"])} for r in rows]


async def build(conn) -> dict[str, Any]:
    sections = {
        "components": _components, "suppliers": _suppliers, "projects": _projects, "customers": _customers,
        "purchaseOrders": _pos, "shipments": _shipments, "payments": _payments, "incidents": _incidents,
        "approvals": _approvals, "feed": _feed, "emails": _emails, "bom": _bom,
        "buyTimers": _timers, "budgetEnvelopes": _envelopes,
    }
    out: dict[str, Any] = {"AUTHORITY_LIMIT_USD": AUTHORITY_LIMIT_USD, "INR_PER_USD": INR_PER_USD}
    for k, fn in sections.items():
        out[k] = await _section(k, fn, conn)
    try:
        out["shield"] = await guards.protected_summary(conn)
    except Exception:  # noqa: BLE001
        out["shield"] = {"total_usd": 0, "by_guard": {}}
    return out
