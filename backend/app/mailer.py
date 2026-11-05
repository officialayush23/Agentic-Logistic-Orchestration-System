"""Real email over SMTP (Gmail app password in SMTP_USERNAME / SMTP_PASSWORD).

Sending never blocks the event loop and never breaks the money loop: if SMTP is
not configured or the send fails, the caller gets False and the audit log says
so. A missed email must not stop a void.
"""
from __future__ import annotations

import asyncio
import logging
import os
import smtplib
from email.message import EmailMessage

log = logging.getLogger("disruptionops.mail")

HOST = os.getenv("SMTP_HOST", "smtp.gmail.com").strip('"')
PORT = int(os.getenv("SMTP_PORT", "587").strip('"'))
USER = os.getenv("SMTP_USERNAME", "").strip('"')
PASSWORD = os.getenv("SMTP_PASSWORD", "").strip('"')
FROM = os.getenv("SMTP_FROM_EMAIL", "").strip('"') or USER
# Who receives release codes and finance alerts. Defaults to the operator's own inbox.
APPROVER = os.getenv("APPROVER_EMAIL", "").strip('"') or USER


def configured() -> bool:
    return bool(USER and PASSWORD)


def _send(to: str, subject: str, text: str, html: str | None) -> None:
    msg = EmailMessage()
    msg["From"] = FROM if "<" in FROM else f"DisruptionOps Agent <{USER}>"
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(HOST, PORT, timeout=20) as s:
        s.starttls()
        s.login(USER, PASSWORD)
        s.send_message(msg)


async def send(to: str, subject: str, text: str, html: str | None = None) -> bool:
    if not configured() or not to:
        log.warning("mail not sent (SMTP not configured): %s", subject)
        return False
    try:
        await asyncio.to_thread(_send, to, subject, text, html)
        return True
    except Exception as exc:  # noqa: BLE001
        log.error("mail to %s failed: %s", to, exc)
        return False


def card(title: str, lines: list[tuple[str, str]], footer: str = "") -> str:
    """Minimal lavender HTML card for agent emails."""
    rows = "".join(
        f"<tr><td style='padding:4px 12px 4px 0;color:#646780'>{k}</td>"
        f"<td style='padding:4px 0;font-weight:600;color:#1a1b3b'>{v}</td></tr>" for k, v in lines)
    return (
        "<div style='font-family:Inter,Segoe UI,Arial,sans-serif;background:#f2f2ff;padding:24px'>"
        "<div style='max-width:520px;margin:auto;background:#fff;border-radius:20px;padding:24px;"
        "border:1px solid #e6e4ff;box-shadow:0 12px 32px -14px rgba(94,89,241,.25)'>"
        "<div style='font-size:12px;font-weight:700;color:#5e59f1;letter-spacing:.04em'>DISRUPTIONOPS AGENT</div>"
        f"<h2 style='margin:8px 0 16px;font-size:18px;color:#1a1b3b'>{title}</h2>"
        f"<table style='font-size:13px'>{rows}</table>"
        f"<p style='margin-top:16px;font-size:12px;color:#646780'>{footer}</p></div></div>")
