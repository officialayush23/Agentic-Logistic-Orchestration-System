"""Let a customer bring their own model key, without opening a hole.

The feature is small: paste a key, pick a provider, we call their account
instead of ours. The security surface is not small, because it takes attacker
input (a URL, a key, a model name) and makes the *server* issue requests with
it. Three distinct risks, handled here rather than hoped about:

1. **SSRF.** A custom `base_url` turns this endpoint into "make my server fetch
   any URL you like". On a cloud host that immediately means the instance
   metadata service — `169.254.169.254` — and therefore the deployment's own
   IAM credentials. This is the single most valuable thing an attacker can do
   with a text box, so the base URL is checked against an allow-list of provider
   hosts and nothing else is reachable. Not a block-list of bad addresses: a
   block-list loses to DNS rebinding, decimal IP encodings, IPv6-mapped
   addresses and redirects. An allow-list of six hostnames does not.

2. **Credential exfiltration by redirect.** Even against an allowed host, an
   HTTP redirect can point the follow-up request — carrying the customer's
   bearer token — somewhere else. Redirects are disabled outright.

3. **Privilege.** A model key is a billable credential and changing it changes
   what the agent is, so it is owner-only, audited, and never readable back.

None of this decides anything about supply chains. It is plumbing, and plumbing
is where products leak.
"""
from __future__ import annotations

import ipaddress
import socket
from typing import Any
from urllib.parse import urlparse

import httpx

from .core import current_org, emit
from . import secrets_box

# --------------------------------------------------------------- the allow-list

#: Exact hostnames, plus the one wildcard AWS genuinely needs (a Bedrock
#: endpoint is regional). Anything not matching is refused with the reason.
ALLOWED_HOSTS = {
    "api.openai.com",
    "api.anthropic.com",
    "api.x.ai",
    "generativelanguage.googleapis.com",
}
ALLOWED_SUFFIXES = (".amazonaws.com",)

PROVIDER_DEFAULTS = {
    "openai":    {"host": "api.openai.com", "model": "gpt-4o-mini"},
    "anthropic": {"host": "api.anthropic.com", "model": "claude-3-5-haiku-20241022"},
    "xai":       {"host": "api.x.ai", "model": "grok-3-mini"},
    "gemini":    {"host": "generativelanguage.googleapis.com",
                  "model": "gemini-2.0-flash"},
    "bedrock":   {"host": "bedrock-runtime.us-east-1.amazonaws.com",
                  "model": "us.anthropic.claude-3-5-haiku-20241022-v1:0"},
}


class Rejected(ValueError):
    """Input refused, with a reason a person can act on."""


def check_base_url(url: str | None) -> str | None:
    """Refuse anything that is not a known provider endpoint.

    Returns the normalised URL, or raises `Rejected` naming the problem. `None`
    in, `None` out — the common case is a customer who did not override it.
    """
    if not url or not url.strip():
        return None
    raw = url.strip()
    p = urlparse(raw)

    if p.scheme != "https":
        raise Rejected(
            f"The endpoint must be https. '{p.scheme or 'no scheme'}' would send "
            f"your key in clear text.")
    host = (p.hostname or "").lower()
    if not host:
        raise Rejected("That endpoint has no hostname.")

    allowed = host in ALLOWED_HOSTS or host.endswith(ALLOWED_SUFFIXES)
    if not allowed:
        raise Rejected(
            f"'{host}' is not a recognised model provider. Custom endpoints are "
            f"limited to: {', '.join(sorted(ALLOWED_HOSTS))} and *.amazonaws.com. "
            f"This is deliberate — an unrestricted endpoint would let anyone who "
            f"can reach this form make our servers issue requests on their "
            f"behalf, including to internal addresses.")

    # Belt and braces against a hostile DNS answer for an allowed name. This is
    # not the primary defence — the allow-list is — but it costs one lookup and
    # closes the case where a provider domain has been made to resolve inward.
    try:
        for family, _, _, _, sockaddr in socket.getaddrinfo(host, 443,
                                                            proto=socket.IPPROTO_TCP):
            ip = ipaddress.ip_address(sockaddr[0])
            if (ip.is_private or ip.is_loopback or ip.is_link_local
                    or ip.is_reserved or ip.is_multicast):
                raise Rejected(
                    f"'{host}' resolves to {ip}, which is an internal address. "
                    f"Refusing to send credentials there.")
    except socket.gaierror:
        raise Rejected(f"'{host}' does not resolve.")

    return raw.rstrip("/")


def check_provider(provider: str) -> str:
    p = (provider or "").strip().lower()
    if p not in PROVIDER_DEFAULTS:
        raise Rejected(
            f"'{provider}' is not supported. One of: "
            f"{', '.join(sorted(PROVIDER_DEFAULTS))}.")
    return p


def check_key(key: str) -> str:
    k = (key or "").strip()
    if len(k) < 16:
        raise Rejected("That does not look like an API key — too short.")
    if len(k) > 512:
        raise Rejected("That is longer than any provider key we know of.")
    if any(c in k for c in "\r\n\t "):
        # Whitespace in a credential is nearly always a paste accident, and a
        # newline in a header value is header injection.
        raise Rejected("The key contains whitespace. Paste it without line breaks.")
    return k


# ------------------------------------------------------------------ storage ---


async def save(conn, *, provider: str, api_key: str, model: str | None,
               base_url: str | None, user_id: str | None) -> dict[str, Any]:
    """Encrypt and store. Returns the safe description, never the key."""
    org = current_org()
    provider = check_provider(provider)
    api_key = check_key(api_key)
    base_url = check_base_url(base_url)

    ct, nonce = secrets_box.seal(api_key, org_id=org)
    hint = secrets_box.hint(api_key)

    await conn.execute(
        """insert into llm_credentials
             (org_id, provider, ciphertext, nonce, hint, model, base_url,
              created_by, updated_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8, now())
           on conflict (org_id) do update set
             provider=excluded.provider, ciphertext=excluded.ciphertext,
             nonce=excluded.nonce, hint=excluded.hint, model=excluded.model,
             base_url=excluded.base_url, updated_at=now(),
             last_ok_at=null, last_error=null""",
        org, provider, ct, nonce, hint, (model or "").strip() or None,
        base_url, user_id)

    # Audited, because changing the model changes what the agent is. The key
    # itself is never in the payload — only that it changed, and to which
    # provider.
    await emit(conn, actor="human", event_type="LLM_CREDENTIAL_SET",
               human_summary=f"Model provider set to {provider} using this "
                             f"organisation's own key ({hint}).",
               agent_reason="Requests now bill to the customer's account. The "
                            "key is stored encrypted and is never returned by "
                            "any endpoint.",
               payload={"provider": provider, "hint": hint, "model": model,
                        "base_url": base_url, "by": user_id})
    return await describe(conn)


async def clear(conn, *, user_id: str | None) -> dict[str, Any]:
    await conn.execute("delete from llm_credentials")
    await emit(conn, actor="human", event_type="LLM_CREDENTIAL_CLEARED",
               human_summary="Removed this organisation's model key. Falling "
                             "back to the platform default.",
               payload={"by": user_id})
    return await describe(conn)


async def describe(conn) -> dict[str, Any]:
    """What the settings screen may know. No ciphertext, no key, ever."""
    row = await conn.fetchrow(
        """select provider, hint, model, base_url, last_ok_at, last_error,
                  created_at, updated_at
             from llm_credentials limit 1""")
    return {
        "configured": row is not None,
        "encryption_available": secrets_box.available(),
        # Shown whether or not a key is configured, because the number people
        # need before they run out is the one they have left.
        "quota": await quota(conn),
        "providers": sorted(PROVIDER_DEFAULTS),
        "allowed_hosts": sorted(ALLOWED_HOSTS) + ["*.amazonaws.com"],
        **(dict(row) if row else {}),
    }


async def load_for_request(conn) -> dict[str, Any] | None:
    """The one path that decrypts. Called when building an outbound request."""
    row = await conn.fetchrow(
        "select provider, ciphertext, nonce, model, base_url from llm_credentials "
        "limit 1")
    if row is None:
        return None
    try:
        key = secrets_box.reveal(row["ciphertext"], row["nonce"],
                                 org_id=current_org())
    except Exception:                                  # noqa: BLE001
        # Tampered row, wrong tenant, or the master key was rotated. All three
        # mean the same thing to the caller and none of them should leak which.
        return None
    return {"provider": row["provider"], "api_key": key,
            "model": row["model"], "base_url": row["base_url"]}


# ------------------------------------------------------- platform allowance ---
#
# Our own key runs the demo. It cannot also run everyone's production traffic,
# so it comes with a fixed number of calls per tenant. After that, model-backed
# features need the tenant's own key.
#
# What the allowance does NOT switch off is the part that decides anything. The
# solver, the hard constraints, the authority gate, the audit log and the
# evaluation are deterministic Python and never call a model — so an exhausted
# allowance degrades explanation and interpretation, not correctness. That is
# only true because the architecture put the decision in Python in the first
# place; a system where the model decides could not offer this at all.

import os                                                       # noqa: E402

PLATFORM_ALLOWANCE = int(os.getenv("PLATFORM_LLM_CALL_ALLOWANCE", "250"))


async def quota(conn) -> dict[str, Any]:
    """Where this tenant stands against the platform allowance."""
    row = await conn.fetchrow(
        "select platform_calls, bonus_calls, exhausted_at from llm_usage limit 1")
    used = int(row["platform_calls"]) if row else 0
    bonus = int(row["bonus_calls"]) if row else 0
    total = PLATFORM_ALLOWANCE + bonus
    return {
        "used": used, "allowance": total,
        "remaining": max(0, total - used),
        "exhausted": used >= total,
        "exhausted_at": row["exhausted_at"] if row else None,
    }


async def record_platform_call(conn) -> None:
    """Count one call against our key. Never counts a tenant's own key."""
    await conn.execute(
        """insert into llm_usage (org_id, platform_calls, first_call_at, last_call_at)
           values (nullif(current_setting('app.org_id', true), ''), 1, now(), now())
           on conflict (org_id) do update set
             platform_calls = llm_usage.platform_calls + 1,
             last_call_at = now(),
             exhausted_at = case
               when llm_usage.exhausted_at is null
                and llm_usage.platform_calls + 1 >= $1 + llm_usage.bonus_calls
               then now() else llm_usage.exhausted_at end""",
        PLATFORM_ALLOWANCE)


async def resolve_for_call(conn) -> tuple[dict[str, Any] | None, str, str | None]:
    """Which credential this tenant's next model call should use.

    Returns `(credential, source, blocked_reason)`:

        (cred, 'tenant',   None)     — their own key, unmetered
        (None, 'platform', None)     — our key, within allowance
        (None, 'blocked',  reason)   — allowance spent, no key of their own

    The blocked case returns a reason rather than raising, because the caller's
    correct response is to fall back to the deterministic answer and tell the
    person why it is thinner than usual — not to fail the request. An agent that
    500s because a quota ran out is a worse product than one that says "I can
    still tell you the numbers; add a key and I can explain them".
    """
    cred = await load_for_request(conn)
    if cred is not None:
        return cred, "tenant", None

    q = await quota(conn)
    if not q["exhausted"]:
        return None, "platform", None

    return None, "blocked", (
        f"This organisation has used its {q['allowance']} trial calls on the "
        f"shared model account. Add your own key under Model & keys to turn the "
        f"model-backed features back on. Everything the solver does — the "
        f"options, the refusals, the authority gate and the audit trail — keeps "
        f"working without it.")


# --------------------------------------------------------------------- test ---


async def verify(conn) -> dict[str, Any]:
    """Call the provider once, cheaply, and record whether it worked.

    "Saved" is not the same claim as "works", and a customer who finds out at
    the first incident that their key was wrong will not forgive the screen that
    said Connected.
    """
    cred = await load_for_request(conn)
    if cred is None:
        return {"ok": False, "detail": "No key is configured for this organisation."}

    provider = cred["provider"]
    base = cred["base_url"] or f"https://{PROVIDER_DEFAULTS[provider]['host']}"
    model = cred["model"] or PROVIDER_DEFAULTS[provider]["model"]

    try:
        url, headers, body = _probe(provider, base, model, cred["api_key"])
        async with httpx.AsyncClient(
                timeout=12.0,
                # No redirects. A 302 from an allowed host to anywhere else
                # would carry the customer's bearer token with it.
                follow_redirects=False) as client:
            r = await client.post(url, headers=headers, json=body)
        ok = r.status_code < 400
        detail = ("Reached the provider and the key was accepted." if ok else
                  f"The provider answered {r.status_code}. "
                  + ("The key was rejected." if r.status_code in (401, 403) else
                     "The model name may be wrong." if r.status_code == 404 else
                     "Try again shortly." if r.status_code == 429 else
                     "See the provider's status page."))
    except httpx.HTTPError as exc:
        ok, detail = False, f"Could not reach the provider: {type(exc).__name__}."

    await conn.execute(
        """update llm_credentials
              set last_ok_at = case when $1 then now() else last_ok_at end,
                  last_error = case when $1 then null else $2 end""",
        ok, detail)
    await emit(conn, actor="human", event_type="LLM_CREDENTIAL_TESTED",
               human_summary=f"Tested the {provider} key — "
                             + ("it works." if ok else detail),
               payload={"provider": provider, "ok": ok})
    return {"ok": ok, "detail": detail, "provider": provider, "model": model}


def _probe(provider: str, base: str, model: str, key: str):
    """The smallest real request each provider accepts. One token out."""
    if provider in ("openai", "xai"):
        return (f"{base}/v1/chat/completions",
                {"Authorization": f"Bearer {key}"},
                {"model": model, "max_tokens": 1,
                 "messages": [{"role": "user", "content": "ping"}]})
    if provider == "anthropic":
        return (f"{base}/v1/messages",
                {"x-api-key": key, "anthropic-version": "2023-06-01"},
                {"model": model, "max_tokens": 1,
                 "messages": [{"role": "user", "content": "ping"}]})
    if provider == "gemini":
        return (f"{base}/v1beta/models/{model}:generateContent",
                {"x-goog-api-key": key},
                {"contents": [{"role": "user", "parts": [{"text": "ping"}]}],
                 "generationConfig": {"maxOutputTokens": 1}})
    # bedrock
    return (f"{base}/model/{model}/invoke",
            {"Authorization": f"Bearer {key}"},
            {"anthropic_version": "bedrock-2023-05-31", "max_tokens": 1,
             "messages": [{"role": "user", "content": "ping"}]})
