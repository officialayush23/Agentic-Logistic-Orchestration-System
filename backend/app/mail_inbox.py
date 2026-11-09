"""Inbound email: supplier replies reach the agent team.

Polls an IMAP mailbox (Gmail by default, same app password as SMTP) and turns
each new message from a supplier into a fact the agents act on:

    payee change    "please pay our new PayPal account x@y"  → agent team payee-lock thread
    acknowledgement "we confirm PO-7725"                      → purchase_orders.acknowledged_at
    new date        "PO-7718 will now ship on 20 Nov"         → revised_date, Sentinel wakes the team
    anything else   stored on the supplier's thread for a human

Matching a message to a supplier: the sender's address or domain against
suppliers.email, or a supplier id in the subject ("[SUP-21] ...") so a demo can
be driven from any inbox. Deterministic parsing runs first; Gemini only sharpens
the date when a key is configured. No LLM output moves money.
"""
from __future__ import annotations

import asyncio
import email
import imaplib
import logging
import os
import re
from datetime import datetime, timezone
from email.header import decode_header, make_header
from email.utils import parseaddr
from typing import Any

from . import llm
from .core import as_system, db_conn, emit, set_org

log = logging.getLogger("disruptionops.inbox")

HOST = os.getenv("IMAP_HOST", "imap.gmail.com")
USER = os.getenv("IMAP_USERNAME") or os.getenv("SMTP_USERNAME") or ""
PASSWORD = os.getenv("IMAP_PASSWORD") or os.getenv("SMTP_PASSWORD") or ""
POLL_S = float(os.getenv("INBOX_POLL_SECONDS", "60"))

EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PO_RE = re.compile(r"\bPO-[A-Z]?\d{3,6}\b", re.I)
SUP_RE = re.compile(r"\bSUP-\d{1,4}\b", re.I)
PAYEE_WORDS = re.compile(r"\b(paypal|bank|account|payee|payout|remit|beneficiary|iban|swift)\b", re.I)
CHANGE_WORDS = re.compile(r"\b(new|change|changed|update|updated|switch|moved)\b", re.I)
ACK_WORDS = re.compile(r"\b(confirm|confirmed|acknowledge|acknowledged|accept|accepted)\b", re.I)
DATE_RE = re.compile(r"\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*(\d{4})?\b", re.I)
MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}


def enabled() -> bool:
    return bool(USER and PASSWORD) and os.getenv("INBOX_ENABLED", "true").lower() not in ("0", "false", "no")


def _text(msg: email.message.Message) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain" and "attachment" not in str(part.get("Content-Disposition", "")):
                return (part.get_payload(decode=True) or b"").decode(part.get_content_charset() or "utf-8", "replace")
        for part in msg.walk():
            if part.get_content_type() == "text/html":
                html = (part.get_payload(decode=True) or b"").decode(part.get_content_charset() or "utf-8", "replace")
                return re.sub(r"<[^>]+>", " ", html)
        return ""
    return (msg.get_payload(decode=True) or b"").decode(msg.get_content_charset() or "utf-8", "replace")


def _strip_quoted(body: str) -> str:
    """Keep the reply, drop the quoted thread below it."""
    out = []
    for line in body.splitlines():
        if line.startswith(">") or re.match(r"^On .+ wrote:$", line.strip()):
            break
        out.append(line)
    return "\n".join(out).strip()


def _fetch_unseen(limit: int = 20) -> list[dict[str, Any]]:
    """Blocking IMAP fetch (run in a thread). Marks fetched messages as seen."""
    msgs: list[dict[str, Any]] = []
    with imaplib.IMAP4_SSL(HOST) as box:
        box.login(USER, PASSWORD)
        box.select("INBOX")
        ok, data = box.search(None, "UNSEEN")
        if ok != "OK":
            return msgs
        for num in (data[0].split() or [])[-limit:]:
            ok, parts = box.fetch(num, "(RFC822)")
            if ok != "OK" or not parts or not isinstance(parts[0], tuple):
                continue
            m = email.message_from_bytes(parts[0][1])
            msgs.append({
                "from": parseaddr(m.get("From", ""))[1].lower(),
                "subject": str(make_header(decode_header(m.get("Subject", "")))),
                "body": _strip_quoted(_text(m))[:4000],
                "message_id": m.get("Message-ID", ""),
            })
    return msgs


def classify(subject: str, body: str, sender: str) -> dict[str, Any]:
    """Deterministic first pass. Returns kind + extracted fields."""
    text = f"{subject}\n{body}"
    pos = list(dict.fromkeys(p.upper() for p in PO_RE.findall(text)))
    emails = [e.lower() for e in EMAIL_RE.findall(body) if e.lower() != sender]
    if PAYEE_WORDS.search(text) and CHANGE_WORDS.search(text) and emails:
        return {"kind": "payee_change", "new_email": emails[0], "po_ids": pos}
    d = DATE_RE.search(text)
    if pos and d:
        day, mon, year = int(d.group(1)), MONTHS[d.group(2).lower()[:3]], int(d.group(3) or datetime.now().year)
        try:
            when = datetime(year, mon, day, 12, tzinfo=timezone.utc)
            return {"kind": "new_date", "po_ids": pos, "date": when.isoformat()}
        except ValueError:
            pass
    if pos and ACK_WORDS.search(text):
        return {"kind": "acknowledgement", "po_ids": pos}
    return {"kind": "other", "po_ids": pos}


async def _match_supplier(conn, sender: str, subject: str) -> dict | None:
    m = SUP_RE.search(subject)
    if m:
        r = await conn.fetchrow("select id, name, email from suppliers where upper(id)=$1", m.group(0).upper())
        if r:
            return dict(r)
    r = await conn.fetchrow("select id, name, email from suppliers where lower(email)=$1", sender)
    if r:
        return dict(r)
    dom = sender.split("@")[-1]
    r = await conn.fetchrow("select id, name, email from suppliers where lower(split_part(email,'@',2))=$1 limit 1", dom)
    return dict(r) if r else None


async def handle(msg: dict[str, Any]) -> dict[str, Any] | None:
    """Route one inbound email. Returns what was done (for logs/tests)."""
    from .agents import runtime as team
    async with as_system():
        async with db_conn() as conn:
            orgs = [r["id"] for r in await conn.fetch("select id from organizations")]
    for org in orgs:
        set_org(org)
        async with db_conn() as conn:
            sup = await _match_supplier(conn, msg["from"], msg["subject"])
            if not sup:
                continue
            c = classify(msg["subject"], msg["body"], msg["from"])
            await conn.execute(
                """insert into messages (incident_id, direction, supplier_id, subject, body)
                   values (null, 'inbound', $1, $2, $3)""", sup["id"], msg["subject"][:300], msg["body"])
            await emit(conn, incident_id=None, actor="supplier", event_type="EMAIL_RECEIVED",
                       human_summary=f"Email from {sup['name']} ({msg['from']}): read as {c['kind'].replace('_', ' ')}.",
                       payload={"subject": msg["subject"], **c})
            if c["kind"] == "acknowledgement":
                await conn.execute("update purchase_orders set acknowledged_at=now() where id = any($1::text[]) "
                                   "and supplier_id=$2", c["po_ids"], sup["id"])
            elif c["kind"] == "new_date":
                if os.getenv("GEMINI_API_KEY"):
                    raw, used = await llm.interpret_supplier_message(msg["body"], {"po_id": c["po_ids"][0]})
                    if used and raw.get("committed_date"):
                        c["date"] = f"{raw['committed_date']}T12:00:00+00:00"
                for po in c["po_ids"]:
                    row = await conn.fetchrow(
                        """update purchase_orders set revised_date=$2::timestamptz
                            where id=$1 and supplier_id=$3 returning component_id, promised_date""",
                        po, c["date"], sup["id"])
                    if row and row["promised_date"] and datetime.fromisoformat(c["date"]) > row["promised_date"]:
                        from . import agent as domain
                        await domain.wake(conn, component_id=row["component_id"], trigger="supplier_push_out", po_id=po)
        if c["kind"] == "payee_change":
            # Never applied: the Treasurer locks it and the Liaison confirms with the contact on file.
            await team.payee_change(supplier_id=sup["id"], new_email=c["new_email"], sender=msg["from"], org=org)
        return {"org": org, "supplier": sup["id"], **c}
    log.info("inbox: no supplier matched %s / %s", msg["from"], msg["subject"])
    return None


async def run_forever() -> None:
    if not enabled():
        log.info("inbox: IMAP not configured; inbound email disabled")
        return
    while True:
        try:
            for m in await asyncio.to_thread(_fetch_unseen):
                try:
                    out = await handle(m)
                    log.info("inbox: %s", out)
                except Exception as exc:  # noqa: BLE001
                    log.warning("inbox: failed on %s: %s", m.get("subject"), exc)
        except Exception as exc:  # noqa: BLE001
            log.warning("inbox: poll failed: %s", exc)
        await asyncio.sleep(POLL_S)
