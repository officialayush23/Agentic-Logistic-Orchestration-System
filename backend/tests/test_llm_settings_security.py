"""The guards on the bring-your-own-key form.

This endpoint takes attacker-controlled input and makes the *server* issue
requests with it, which is the shape of every SSRF that has ever mattered. These
tests are the ones worth having.
"""
from __future__ import annotations

import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

os.environ.setdefault("CREDENTIAL_ENCRYPTION_KEY",
                      "dGVzdC1rZXktZm9yLXVuaXQtdGVzdHMtMzJieXRlcyE=")

from app import secrets_box                                   # noqa: E402
from app.llm_settings import (Rejected, check_base_url,       # noqa: E402
                              check_key, check_provider)


# --------------------------------------------------------------------------
# SSRF: the reason this file exists
# --------------------------------------------------------------------------

@pytest.mark.parametrize("url", [
    "http://169.254.169.254/latest/meta-data/",     # cloud instance metadata
    "https://169.254.169.254/",                     # …over https
    "http://localhost:8000/api/scenarios/reset",    # our own admin surface
    "https://127.0.0.1/",
    "http://[::1]:8000/",
    "https://10.0.0.5/v1/chat/completions",
    "https://192.168.1.1/",
    "http://metadata.google.internal/",
    "file:///etc/passwd",
    "gopher://127.0.0.1:6379/_FLUSHALL",
])
def test_internal_and_exotic_targets_are_refused(url):
    """An allow-list, not a block-list.

    A block-list loses to decimal IPs, IPv6-mapped addresses, DNS rebinding and
    redirects. Six known hostnames do not.
    """
    with pytest.raises(Rejected):
        check_base_url(url)


def test_plain_http_is_refused_even_for_an_allowed_host():
    """http would put the customer's key on the wire in clear text."""
    with pytest.raises(Rejected) as e:
        check_base_url("http://api.openai.com")
    assert "https" in str(e.value).lower()


def test_an_unknown_but_public_host_is_refused():
    with pytest.raises(Rejected) as e:
        check_base_url("https://evil.example.com/v1")
    assert "not a recognised model provider" in str(e.value)


def test_lookalike_domains_do_not_pass():
    """Suffix matching on the wrong end is a classic allow-list bypass."""
    for url in ["https://api.openai.com.evil.com/",
                "https://notapi.x.ai/",
                "https://amazonaws.com.attacker.net/"]:
        with pytest.raises(Rejected):
            check_base_url(url)


def test_real_provider_endpoints_are_allowed():
    assert check_base_url("https://api.openai.com") == "https://api.openai.com"
    assert check_base_url("https://api.x.ai/v1/") == "https://api.x.ai/v1"
    assert check_base_url(
        "https://bedrock-runtime.ap-south-1.amazonaws.com").endswith("amazonaws.com")


def test_no_base_url_is_fine():
    assert check_base_url(None) is None
    assert check_base_url("   ") is None


# --------------------------------------------------------------------------
# Header injection and paste accidents
# --------------------------------------------------------------------------

def test_whitespace_in_a_key_is_refused():
    """A newline in a value that becomes a header is header injection."""
    with pytest.raises(Rejected):
        check_key("sk-abcdef0123456789\r\nX-Evil: yes")
    with pytest.raises(Rejected):
        check_key("sk-abc def0123456789")


def test_absurd_key_lengths_are_refused():
    with pytest.raises(Rejected):
        check_key("short")
    with pytest.raises(Rejected):
        check_key("x" * 513)


def test_unknown_provider_is_refused():
    with pytest.raises(Rejected):
        check_provider("my-own-llm")
    assert check_provider("OpenAI") == "openai"


# --------------------------------------------------------------------------
# Encryption
# --------------------------------------------------------------------------

def test_round_trip():
    ct, nonce = secrets_box.seal("sk-secret-key-value-here", org_id="NEXA")
    assert secrets_box.reveal(ct, nonce, org_id="NEXA") == "sk-secret-key-value-here"


def test_ciphertext_does_not_contain_the_plaintext():
    ct, _ = secrets_box.seal("sk-secret-key-value-here", org_id="NEXA")
    assert b"secret" not in ct


def test_a_row_copied_to_another_tenant_will_not_open():
    """org_id is authenticated. Moving ciphertext sideways fails closed.

    This is the attack if someone gets UPDATE on the table but not the master
    key: rewrite org_id and read another tenant's credential.
    """
    ct, nonce = secrets_box.seal("sk-secret-key-value-here", org_id="NEXA")
    with pytest.raises(Exception):
        secrets_box.reveal(ct, nonce, org_id="ACME")


def test_tampered_ciphertext_is_rejected_not_silently_wrong():
    ct, nonce = secrets_box.seal("sk-secret-key-value-here", org_id="NEXA")
    bad = bytearray(ct); bad[0] ^= 0xFF
    with pytest.raises(Exception):
        secrets_box.reveal(bytes(bad), nonce, org_id="NEXA")


def test_nonces_are_never_reused():
    """GCM is catastrophically broken by nonce reuse."""
    seen = {secrets_box.seal("sk-same-key-every-time", org_id="NEXA")[1]
            for _ in range(200)}
    assert len(seen) == 200


def test_hint_shows_the_tail_not_the_head():
    """Provider prefixes plus a length are a head start for an attacker."""
    h = secrets_box.hint("sk-proj-ABCDEFGHIJKLMNOP")
    assert h == "…MNOP"
    assert "sk-" not in h


# --------------------------------------------------------------------------
# A tenant's key must actually be the one used
# --------------------------------------------------------------------------

from app import providers                                       # noqa: E402


def _built(provider, **over):
    cred = {"provider": provider, "api_key": "TENANT-KEY-abcdefghijklmnop", **over}
    driver, why = providers.for_tenant(cred)
    assert driver is not None, why
    url, headers, body = driver.build(
        driver.models[0], prompt="hi", system=None, json_mode=False, max_tokens=8)
    return url, headers, body


@pytest.mark.parametrize("provider", ["gemini", "xai", "openai", "anthropic"])
def test_the_tenant_key_replaces_the_platform_key(provider):
    """The bug this catches: the base drivers reference their key by class name.

    A subclass that merely sets `key` does not override `Gemini.key`, so the
    tenant would believe their account was in use while the platform key was
    billed. Silent, and exactly the sort of thing nobody notices until an
    invoice arrives.
    """
    _, headers, _ = _built(provider)
    blob = " ".join(f"{k}:{v}" for k, v in headers.items())
    assert "TENANT-KEY-abcdefghijklmnop" in blob
    # No platform credential may survive into the outbound headers.
    for leaked in (providers.GEMINI_API_KEY, providers.XAI_API_KEY,
                   providers.BEDROCK_API_KEY):
        if leaked:
            assert leaked not in blob


def test_provider_specific_auth_header_is_used():
    _, h, _ = _built("gemini");    assert "x-goog-api-key" in h
    _, h, _ = _built("anthropic"); assert "x-api-key" in h and "anthropic-version" in h
    _, h, _ = _built("openai");    assert h["Authorization"].startswith("Bearer ")


def test_a_custom_endpoint_is_honoured():
    url, _, _ = _built("openai", base_url="https://api.openai.com")
    assert url.startswith("https://api.openai.com")


def test_the_tenant_model_is_the_one_requested():
    driver, _ = providers.for_tenant(
        {"provider": "xai", "api_key": "k" * 20, "model": "grok-4-fast-non-reasoning"})
    assert driver.models == ["grok-4-fast-non-reasoning"]


def test_an_unknown_provider_is_refused_not_guessed():
    driver, why = providers.for_tenant({"provider": "hackerllm", "api_key": "k" * 20})
    assert driver is None and "hackerllm" in why


def test_two_tenants_do_not_share_a_driver():
    """A mutated shared class would leak one tenant's key into the next request."""
    a, _ = providers.for_tenant({"provider": "xai", "api_key": "AAAA" * 5})
    b, _ = providers.for_tenant({"provider": "xai", "api_key": "BBBB" * 5})
    _, ha, _ = a.build("m", prompt="p", system=None, json_mode=False, max_tokens=1)
    _, hb, _ = b.build("m", prompt="p", system=None, json_mode=False, max_tokens=1)
    assert "AAAA" in ha["Authorization"] and "BBBB" not in ha["Authorization"]
    assert "BBBB" in hb["Authorization"] and "AAAA" not in hb["Authorization"]
