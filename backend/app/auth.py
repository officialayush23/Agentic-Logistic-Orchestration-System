"""Who is asking, and which organisation they are asking about.

The hackathon build had no answer to either question. Every request read the
whole database, and `/supplier/SUP-42` meant that anyone holding that URL *was*
that supplier. This module supplies the answer; migration 0010 enforces it.

Four kinds of bearer token, one table, one resolution path:

    session   — a person signed in through the dashboard
    api       — a machine (ERP connector, CI, a customer's own scripts)
    supplier  — one supplier's portal link. Scoped to that supplier alone.
    warehouse — one facility's tablet. Scoped to that facility alone.

The last two matter more than they look. A supplier is not a member of the
tenant — they are a counterparty who must see their own RFQs and nothing else.
Handing them a session token because it was convenient would expose every other
supplier's pricing to a competitor, which is the kind of mistake that ends a
B2B contract.

Only the SHA-256 of a token is stored. A database dump does not yield a working
credential, and we can never email a customer their token back because we do not
have it — which is the correct trade.

Passwords use PBKDF2-HMAC-SHA256 from the standard library. Not because it is
the best choice — argon2id is — but because it needs no dependency and is not
embarrassing. `PASSWORD_SCHEME` exists so switching later is a migration rather
than an archaeology project.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, Header, HTTPException

from .core import as_system, db_conn, set_org

# ------------------------------------------------------------------ config ---

SESSION_TTL_HOURS = int(os.getenv("SESSION_TTL_HOURS", "720"))          # 30 days
PORTAL_TTL_HOURS = int(os.getenv("PORTAL_TOKEN_TTL_HOURS", "336"))      # 14 days
PBKDF2_ROUNDS = int(os.getenv("PBKDF2_ROUNDS", "240000"))
PASSWORD_SCHEME = "pbkdf2_sha256"


# --------------------------------------------------------------- primitives --


def _now() -> datetime:
    """Real wall-clock time, deliberately not the simulated clock.

    `core.CLOCK` runs at one hour per second so a five-day delay plays out in
    two minutes. A session that inherits that would expire during the demo it
    was issued for.
    """
    return datetime.now(timezone.utc)


def hash_password(password: str) -> str:
    if not password or len(password) < 8:
        raise ValueError("password must be at least 8 characters")
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)
    return f"{PASSWORD_SCHEME}${PBKDF2_ROUNDS}${base64.b64encode(salt).decode()}" \
           f"${base64.b64encode(dk).decode()}"


def verify_password(password: str, stored: str | None) -> bool:
    """Constant-time, and false rather than raising on anything malformed.

    A user with no password set (`stored is None`) must fail here, not crash —
    invited-but-not-yet-activated is a normal state, not an error.
    """
    if not stored or not password:
        return False
    try:
        scheme, rounds, salt_b64, dk_b64 = stored.split("$")
        if scheme != PASSWORD_SCHEME:
            return False
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(),
                                 base64.b64decode(salt_b64), int(rounds))
        return hmac.compare_digest(dk, base64.b64decode(dk_b64))
    except (ValueError, TypeError):
        return False


def _token_hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ------------------------------------------------------------------ issuing --


async def issue_token(conn, *, kind: str, org_id: str,
                      user_id: str | None = None,
                      subject_id: str | None = None,
                      label: str | None = None,
                      ttl_hours: int | None = None) -> str:
    """Mint a token, store only its hash, return the raw value once.

    This is the only moment the caller can ever see it. That is the point.
    """
    raw = f"do_{kind[:3]}_{secrets.token_urlsafe(32)}"
    ttl = ttl_hours if ttl_hours is not None else (
        SESSION_TTL_HOURS if kind in ("session", "api") else PORTAL_TTL_HOURS)
    await conn.execute(
        """insert into auth_tokens
             (token_hash, kind, org_id, user_id, subject_id, label, expires_at)
           values ($1,$2,$3,$4,$5,$6,$7)""",
        _token_hash(raw), kind, org_id, user_id, subject_id, label,
        _now() + timedelta(hours=ttl) if ttl else None)
    return raw


async def revoke_token(conn, raw: str) -> bool:
    n = await conn.fetchval(
        """with x as (update auth_tokens set revoked_at = now()
                       where token_hash = $1 and revoked_at is null returning 1)
           select count(*) from x""", _token_hash(raw)) or 0
    return bool(n)


# ----------------------------------------------------------------- resolving --


async def resolve(raw: str) -> dict[str, Any] | None:
    """Token -> {org_id, user_id, kind, subject_id, role}, or None.

    Runs under `as_system()` because the token table has to be read before we
    know which organisation to scope to — the chicken-and-egg every auth layer
    has, resolved in exactly one place rather than by leaving the table open.
    """
    async with as_system():
        async with db_conn() as conn:
            row = await conn.fetchrow(
                """select t.token_hash, t.kind, t.org_id, t.user_id, t.subject_id,
                          t.expires_at, t.revoked_at,
                          m.role, u.is_active, u.email, u.full_name,
                          o.is_active as org_active
                     from auth_tokens t
                     left join users u on u.id = t.user_id
                     left join org_members m
                            on m.user_id = t.user_id and m.org_id = t.org_id
                     left join organizations o on o.id = t.org_id
                    where t.token_hash = $1""", _token_hash(raw))
            if row is None or row["revoked_at"] is not None:
                return None
            if row["expires_at"] is not None and row["expires_at"] < _now():
                return None
            if row["org_active"] is False:
                return None
            # A person who has been deactivated, or removed from the org, must
            # stop working immediately — not whenever their token happens to
            # expire. Portal tokens have no user and are exempt.
            if row["user_id"] is not None:
                if row["is_active"] is False or row["role"] is None:
                    return None
            await conn.execute(
                "update auth_tokens set last_used_at = now() where token_hash = $1",
                row["token_hash"])
            return {
                "kind": row["kind"], "org_id": row["org_id"],
                "user_id": row["user_id"], "subject_id": row["subject_id"],
                "role": row["role"], "email": row["email"],
                "full_name": row["full_name"],
            }


# --------------------------------------------------------- FastAPI plumbing --


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, value = authorization.partition(" ")
    return value.strip() if scheme.lower() == "bearer" and value.strip() else None


async def principal(authorization: str | None = Header(default=None),
                    x_portal_token: str | None = Header(default=None)) -> dict:
    """The dependency every tenant-scoped route hangs off.

    Sets the organisation into the context here, once, so that every query the
    handler runs is filtered by Postgres without the handler doing anything.
    Forgetting to scope a query is no longer possible; forgetting this
    dependency is, which is why it fails closed and loudly rather than
    defaulting to a tenant.
    """
    raw = _bearer(authorization) or x_portal_token
    if not raw:
        raise HTTPException(401, "Missing bearer token.")
    who = await resolve(raw)
    if who is None:
        raise HTTPException(401, "That token is invalid, expired or revoked.")
    set_org(who["org_id"])
    return who


async def member(who: dict = Depends(principal)) -> dict:
    """A human or machine acting for the tenant — not a supplier or a plant."""
    if who["kind"] in ("supplier", "warehouse"):
        raise HTTPException(
            403, "This is a portal token. It can act only for the counterparty "
                 "it was issued to.")
    return who


def requires(*roles: str):
    """Role gate. `approver` is the one that matters — it guards spend."""
    allowed = set(roles)

    async def _dep(who: dict = Depends(member)) -> dict:
        if who["kind"] == "api":
            return who                       # machine tokens carry org, not role
        if who.get("role") not in allowed:
            raise HTTPException(
                403, f"This needs one of: {', '.join(sorted(allowed))}. "
                     f"You are {who.get('role') or 'not a member'}.")
        return who
    return _dep


async def portal(kind: str, who: dict) -> str:
    """The counterparty id a portal token speaks for, or 403.

    A supplier token must never be able to read another supplier's threads, and
    the id comes from the token rather than from the URL — which is the whole
    difference between an authenticated portal and a guessable one.
    """
    if who["kind"] != kind or not who["subject_id"]:
        raise HTTPException(403, f"This route needs a {kind} portal token.")
    return who["subject_id"]


# -------------------------------------------------------------- onboarding ---


async def create_org(*, org_id: str, name: str, email: str, password: str,
                     full_name: str | None = None,
                     industry: str | None = None,
                     city: str | None = None,
                     country: str | None = None) -> dict[str, Any]:
    """Create an organisation and its first owner. Runs under bypass.

    Signup is the one operation that genuinely cannot be tenant-scoped: it
    creates the tenant. Everything after it is.
    """
    async with as_system():
        async with db_conn() as conn:
            async with conn.transaction():
                exists = await conn.fetchval(
                    "select 1 from organizations where id = $1", org_id)
                if exists:
                    raise ValueError(f"organisation '{org_id}' already exists")
                taken = await conn.fetchval(
                    "select 1 from users where lower(email) = lower($1)", email)
                if taken:
                    raise ValueError("that email already has an account")

                await conn.execute(
                    """insert into organizations (id, name, industry, city, country)
                       values ($1,$2,$3,$4,$5)""",
                    org_id, name, industry, city, country)
                user_id = f"USR-{uuid.uuid4().hex[:12]}"
                await conn.execute(
                    """insert into users (id, email, full_name, password_hash)
                       values ($1,$2,$3,$4)""",
                    user_id, email.strip().lower(), full_name,
                    hash_password(password))
                await conn.execute(
                    "insert into org_members (org_id, user_id, role) "
                    "values ($1,$2,'owner')", org_id, user_id)
                token = await issue_token(conn, kind="session", org_id=org_id,
                                          user_id=user_id, label="signup")
    return {"org_id": org_id, "user_id": user_id, "token": token, "role": "owner"}


async def login(email: str, password: str) -> dict[str, Any] | None:
    """Email and password to a session token, or None.

    One failure message for every cause — wrong password, unknown email,
    deactivated account, no organisation. Distinguishing them tells an attacker
    which half of the credential they got right.
    """
    async with as_system():
        async with db_conn() as conn:
            row = await conn.fetchrow(
                """select u.id, u.password_hash, u.is_active,
                          m.org_id, m.role, o.name as org_name
                     from users u
                     left join org_members m on m.user_id = u.id
                     left join organizations o on o.id = m.org_id
                    where lower(u.email) = lower($1)
                    order by m.created_at limit 1""", email)
            if row is None or not row["is_active"] or not row["org_id"]:
                return None
            if not verify_password(password, row["password_hash"]):
                return None
            token = await issue_token(conn, kind="session", org_id=row["org_id"],
                                      user_id=row["id"], label="password login")
            await conn.execute(
                "update users set last_seen_at = now() where id = $1", row["id"])
    return {"token": token, "org_id": row["org_id"], "org_name": row["org_name"],
            "user_id": row["id"], "role": row["role"]}
