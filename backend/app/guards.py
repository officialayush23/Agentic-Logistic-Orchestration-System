"""Buyer Shield: seven deterministic guards between the agents and the money.

No LLM call anywhere in this file. Every decision is a `Verdict`, and every
verdict worth remembering is written to `guard_events`, which is where the
"money protected" numbers come from.

    fair_price        before a hold   quote vs should-cost / last price paid
    budget            before a hold   project envelope for its date window
    payee_lock        before a payout only the verified payee, no pending change
    duplicate         before capture  same invoice / same PO paid twice
    late_credit       at capture      liquidated damages deducted from the capture
    quality_holdback  at capture      pay accepted units only, keep retention
    hold_expiry       daily           re-authorize holds before they lapse
"""
from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any

from .core import CLOCK, emit

# Thresholds are policy, kept in one place so the UI and the docs can quote them.
FAIR_NEGOTIATE = 1.15      # >15% over should-cost: negotiate
FAIR_BLOCK = 1.50          # >50% over should-cost: block (broker markup)
LAST_PAID_BLOCK = 3.0      # >3x last price paid: block
PAYEE_COOLING_H = 72
HOLD_REAUTH_AFTER_D = 25   # PayPal authorizations expire at 29 days
LATE_GRACE_D = 0


@dataclass
class Verdict:
    guard: str
    outcome: str                 # pass | block | adjust | escalate
    reason: str
    amount_usd: float = 0.0      # money protected / saved
    detail: dict[str, Any] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return self.outcome in ("pass", "adjust")

    def to_dict(self) -> dict[str, Any]:
        return asdict(self) | {"ok": self.ok}


async def record(conn, v: Verdict, *, po_id: str | None = None, supplier_id: str | None = None,
                 incident_id: str | None = None, agent: str = "treasurer") -> None:
    """Persist a guard decision and narrate it in the audit log."""
    try:
        await conn.execute(
            """insert into guard_events (guard, outcome, po_id, supplier_id, incident_id,
                                         amount_usd, reason, detail, agent)
               values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)""",
            v.guard, v.outcome, po_id, supplier_id, incident_id, round(v.amount_usd, 2),
            v.reason, json.dumps(v.detail, default=str), agent)
    except Exception:  # noqa: BLE001 - migration 0012 not applied yet: never block money on logging
        pass
    if v.outcome != "pass":
        await emit(conn, incident_id=incident_id, actor="agent", event_type=f"GUARD_{v.outcome.upper()}",
                   human_summary=f"[{v.guard}] {v.reason}",
                   payload={"po_id": po_id, "supplier_id": supplier_id, **v.to_dict()})


def _usd(inr: float, rate: float) -> float:
    return round(inr / rate, 2)


# ---------------------------------------------------------------- price --

async def fair_price(conn, po: dict, *, inr_per_usd: float) -> Verdict:
    bench = await _safe_row(conn, "select * from price_benchmarks where component_id=$1", po["component_id"])
    unit = float(po["unit_price"] or 0)
    qty = int(po["quantity"] or 0)
    if not bench:
        return Verdict("fair_price", "pass", "No benchmark on file for this part; price accepted as quoted.",
                       detail={"unit_inr": unit})
    should = float(bench["should_cost_inr"])
    # A de-escalated index lowers the fair price for index-linked parts.
    if bench.get("index_base") and bench.get("index_now"):
        move = float(bench["index_now"]) / float(bench["index_base"]) - 1
        if abs(move) * 100 > float(bench["deadband_pct"] or 3):
            should = round(should * (1 + move), 2)
    last = float(bench["last_paid_inr"] or 0)
    ratio = unit / should if should else 1.0
    over_inr = max(0.0, (unit - should) * qty)
    detail = {"unit_inr": unit, "should_cost_inr": should, "last_paid_inr": last, "ratio": round(ratio, 2)}
    if ratio > FAIR_BLOCK or (last and unit > last * LAST_PAID_BLOCK):
        return Verdict("fair_price", "block",
                       f"Quote is {ratio:.1f}x should-cost ({unit:,.2f} vs {should:,.2f} per unit): broker markup, blocked.",
                       amount_usd=_usd(over_inr, inr_per_usd), detail=detail)
    if ratio > FAIR_NEGOTIATE:
        return Verdict("fair_price", "escalate",
                       f"Quote is {(ratio - 1) * 100:.0f}% over should-cost; held for negotiation/approval.",
                       detail=detail)
    return Verdict("fair_price", "pass", f"Quote within {(ratio - 1) * 100:+.0f}% of should-cost.", detail=detail)


# --------------------------------------------------------------- budget --

async def budget(conn, po: dict, amount_usd: float) -> Verdict:
    project = po.get("project_id")
    if not project:
        return Verdict("budget", "pass", "PO is not tied to a project budget.")
    env = await _safe_row(
        conn, """select * from budget_envelopes where project_id=$1
                  and window_start <= current_date and window_end >= current_date
                  order by category nulls last limit 1""", project)
    if not env:
        return Verdict("budget", "pass", f"No active budget envelope for {project}.")
    committed = await conn.fetchval(
        """select coalesce(sum(p.amount_usd),0) from payments p
             join purchase_orders o on o.id = p.po_id
            where o.project_id=$1 and not p.archived
              and p.state in ('funds_held','awaiting_approval','funds_released','retention_held','payout_sent')""",
        project) or 0
    cap = float(env["cap_usd"])
    after = float(committed) + amount_usd
    detail = {"project_id": project, "cap_usd": cap, "committed_usd": float(committed), "after_usd": round(after, 2)}
    if after > cap:
        return Verdict("budget", "escalate",
                       f"{project} envelope: ${after:,.0f} would exceed the ${cap:,.0f} cap; needs the owner's code.",
                       detail=detail)
    return Verdict("budget", "pass", f"{project}: ${after:,.0f} of ${cap:,.0f} committed after this hold.", detail=detail)


# ----------------------------------------------------------- payee lock --

async def payee_lock(conn, supplier_id: str) -> tuple[Verdict, str | None]:
    s = await conn.fetchrow("select * from suppliers where id=$1", supplier_id)
    if not s:
        return Verdict("payee_lock", "block", "Unknown supplier: no payout."), None
    s = dict(s)
    email = s.get("paypal_email_verified") or s.get("paypal_email")
    pending = await _safe_row(
        conn, "select * from payee_change_requests where supplier_id=$1 and status='pending' order by id desc limit 1",
        supplier_id)
    if pending:
        return Verdict("payee_lock", "block",
                       f"A payee change to {pending['new_email']} is pending until "
                       f"{pending['cooling_until']:%d %b %H:%M}; payouts stay with the verified payee only.",
                       detail={"pending_email": pending["new_email"]}), s.get("paypal_email_verified")
    if not email:
        return Verdict("payee_lock", "block", "No verified PayPal payee on file."), None
    return Verdict("payee_lock", "pass", f"Payout locked to verified payee {email}."), email


async def request_payee_change(conn, supplier_id: str, new_email: str, *, sender: str | None,
                               amount_at_risk_usd: float = 0) -> Verdict:
    """Inbound 'we changed our account' → never applied directly. Cooling-off + owner code."""
    s = await conn.fetchrow("select email, paypal_email_verified, paypal_email from suppliers where id=$1", supplier_id)
    known = (s and (s["email"] or "").split("@")[-1].lower()) or ""
    from_dom = (sender or "").split("@")[-1].lower()
    lookalike = bool(from_dom and known and from_dom != known)
    await conn.execute(
        "insert into payee_change_requests (supplier_id, new_email, sender) values ($1,$2,$3)",
        supplier_id, new_email, sender)
    why = (f"Payee change to {new_email} requested"
           + (f" from look-alike domain {from_dom} (supplier domain is {known})" if lookalike else "")
           + f". Locked for {PAYEE_COOLING_H} h; confirmation sent to the contact on file; needs the owner's code.")
    v = Verdict("payee_lock", "block", why, amount_usd=amount_at_risk_usd,
                detail={"new_email": new_email, "sender": sender, "lookalike": lookalike})
    await record(conn, v, supplier_id=supplier_id, agent="liaison")
    return v


# ------------------------------------------------------------ duplicate --

_NORM = re.compile(r"[^A-Z0-9]")


def norm_invoice(no: str | None) -> str:
    """ZH/INV/55120-A → ZHINV55120 (trailing revision letters are a classic duplicate)."""
    s = _NORM.sub("", (no or "").upper())
    return re.sub(r"(\d)[A-Z]{1,2}$", r"\1", s)


async def duplicate(conn, payment: dict, *, invoice_number: str | None) -> Verdict:
    po_id = payment["po_id"]
    po = await _safe_row(conn, "select cancelled, status from purchase_orders where id=$1", po_id)
    amount = float(payment["amount_usd"])
    if po and (po.get("cancelled") or str(po.get("status")) == "cancelled"):
        return Verdict("duplicate", "block", f"{po_id} is cancelled; nothing is owed on it.", amount_usd=amount)
    already = await conn.fetchval(
        """select coalesce(sum(coalesce(captured_usd, amount_usd)),0) from payments
            where po_id=$1 and id<>$2 and capture_id is not null and state <> 'refunded'
              and not archived""",
        po_id, payment["id"]) or 0
    if float(already) > 0:
        return Verdict("duplicate", "block", f"{po_id} was already paid ${float(already):,.2f}; second payment refused.",
                       amount_usd=amount)
    if invoice_number:
        key = norm_invoice(invoice_number)
        rows = await conn.fetch(
            """select id, po_id, invoice_number, amount_usd from payments
                where id<>$1 and invoice_number is not null and capture_id is not null
                  and not archived""", payment["id"])
        for r in rows:
            same_amount = abs(float(r["amount_usd"]) - amount) <= max(1.0, amount * 0.01)
            if norm_invoice(r["invoice_number"]) == key and same_amount:
                return Verdict("duplicate", "block",
                               f"Invoice {invoice_number} duplicates {r['invoice_number']} already paid on {r['po_id']}.",
                               amount_usd=amount, detail={"original": r["invoice_number"]})
    return Verdict("duplicate", "pass", "No prior payment for this PO or invoice.")


# ------------------------------------------------- late credit / holdback --

def late_credit(po: dict, value_usd: float, *, delivered_at: datetime | None = None) -> Verdict:
    due = po.get("promised_date") or po.get("expected_delivery")
    when = delivered_at or CLOCK.now()
    if not due:
        return Verdict("late_credit", "pass", "No promised date on the PO.")
    days = (when - due).total_seconds() / 86400 - LATE_GRACE_D
    if days <= 0.5:
        return Verdict("late_credit", "pass", "Delivered on time.")
    d = round(days)
    pct = float(po.get("ld_pct_per_week") or 5)
    cap = float(po.get("ld_cap_pct") or 10)
    credit = min(value_usd * pct / 100 * d / 7, value_usd * cap / 100)
    return Verdict("late_credit", "adjust",
                   f"{d} day(s) late at {pct:g}%/week: ${credit:,.2f} deducted from the capture.",
                   amount_usd=round(credit, 2), detail={"days_late": d, "pct_per_week": pct})


def quality_holdback(po: dict, ordered: int, approved: int, value_usd: float) -> tuple[Verdict, float, float]:
    """Return (verdict, accepted_value, retention)."""
    frac = min(1.0, approved / ordered) if ordered else 1.0
    accepted = round(value_usd * frac, 2)
    ret_pct = float(po.get("retention_pct") or 0)
    retention = round(accepted * ret_pct / 100, 2)
    rejected = round(value_usd - accepted, 2)
    if frac >= 0.999 and not retention:
        return Verdict("quality_holdback", "pass", "All units passed QC."), accepted, 0.0
    msg = []
    if frac < 0.999:
        msg.append(f"only {approved}/{ordered} passed QC, paying ${accepted:,.2f}")
    if retention:
        msg.append(f"{ret_pct:g}% retention (${retention:,.2f}) held until line acceptance")
    return (Verdict("quality_holdback", "adjust", "; ".join(msg).capitalize() + ".",
                    amount_usd=rejected, detail={"accepted_usd": accepted, "retention_usd": retention}),
            accepted, retention)


# ---------------------------------------------------------- hold expiry --

def hold_needs_reauth(payment: dict) -> bool:
    created = payment.get("created_at")
    if not created or not payment.get("authorization_id") or payment.get("capture_id"):
        return False
    last = payment.get("reauthorized_at") or created
    return datetime.now(timezone.utc) - last > timedelta(days=HOLD_REAUTH_AFTER_D)


def early_pay(discount_pct: float | None, discount_days: int | None, net_days: int | None,
              cost_of_capital: float = 0.12) -> tuple[bool, float]:
    """Annualized return of taking an early-payment discount."""
    if not discount_pct or not discount_days or not net_days or net_days <= discount_days:
        return False, 0.0
    r = discount_pct / (100 - discount_pct) * 365 / (net_days - discount_days)
    return r > cost_of_capital, round(r, 4)


# -------------------------------------------------------------- helpers --

async def _safe_row(conn, sql: str, *args) -> dict | None:
    """Guard tables arrive in migration 0012; until then every guard passes open."""
    try:
        r = await conn.fetchrow(sql, *args)
    except Exception:  # noqa: BLE001
        return None
    return dict(r) if r else None


async def protected_summary(conn) -> dict[str, Any]:
    try:
        rows = await conn.fetch(
            """select guard, count(*) n, coalesce(sum(amount_usd),0) usd
                 from guard_events where outcome <> 'pass' group by guard""")
    except Exception:  # noqa: BLE001
        return {"total_usd": 0, "by_guard": {}}
    by = {r["guard"]: {"count": r["n"], "usd": float(r["usd"])} for r in rows}
    return {"total_usd": round(sum(v["usd"] for v in by.values()), 2), "by_guard": by}
