"""Encrypt tenant credentials so a database dump is not a breach.

A customer pasting their own model key into this product is trusting us with a
billable credential. Storing it in a text column means it appears in backups, in
`pg_dump` output, in a read replica, in whatever a support engineer copies into a
ticket, and in the blast radius of any SQL injection anywhere in the codebase.
None of that is acceptable, and none of it is fixed by row-level security —
RLS decides *who can select the row*, not *what the row is worth once selected*.

So the key is encrypted with AES-256-GCM under a key that lives only in the
application environment. Postgres never sees the plaintext and cannot derive it.
An attacker with a full database copy has ciphertext.

Three properties worth being explicit about:

**AEAD, not just encryption.** GCM authenticates as well as encrypts, and the
tenant's `org_id` is passed as associated data. Moving a ciphertext row from one
tenant to another — the obvious attack if someone gets UPDATE on the table —
makes decryption fail rather than silently handing tenant A tenant B's key.

**A fresh nonce per write.** GCM is catastrophically broken by nonce reuse: two
messages under the same key and nonce leak their XOR and, worse, the
authentication subkey. `os.urandom(12)` per encryption, never derived from
anything, never reused.

**No decrypt-to-display path.** `reveal()` exists for one caller — the code that
builds an outbound model request. Nothing returns plaintext to an API response,
so "show me my key" is not a feature and cannot be socially engineered into one.
A customer who loses their key rotates it at the provider; that is the correct
answer and the only safe one.
"""
from __future__ import annotations

import base64
import hashlib
import os

try:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
except ImportError:                                    # pragma: no cover
    AESGCM = None


class SecretsUnavailable(RuntimeError):
    """No encryption key configured. Refuse rather than store plaintext.

    The tempting failure mode here is "encryption is optional, fall back to a
    text column". That turns a deployment mistake into a silent data-protection
    failure that nobody discovers until it matters, so this raises instead.
    """


def _master_key() -> bytes:
    """32 bytes from CREDENTIAL_ENCRYPTION_KEY.

    Accepts base64 or hex or a passphrase. A passphrase is hashed rather than
    rejected, because a deployment that would otherwise ship with encryption
    disabled is worse than one with a merely-adequate key — but the env var
    should hold 32 random bytes, and `make-key` in the docs prints one.
    """
    raw = (os.getenv("CREDENTIAL_ENCRYPTION_KEY") or "").strip()
    if not raw:
        raise SecretsUnavailable(
            "CREDENTIAL_ENCRYPTION_KEY is not set. Customer model keys cannot be "
            "stored without it, and storing them unencrypted is not an option "
            "this system offers. Generate one with: "
            "python -c \"import os,base64;print(base64.b64encode(os.urandom(32)).decode())\"")
    for decode in (base64.b64decode, bytes.fromhex):
        try:
            k = decode(raw)
            if len(k) == 32:
                return k
        except Exception:                              # noqa: BLE001
            pass
    # Not 32 raw bytes in any encoding we recognise — stretch it deterministically.
    return hashlib.sha256(raw.encode()).digest()


def available() -> bool:
    """Whether credential storage can work at all, for the health endpoint."""
    if AESGCM is None:
        return False
    try:
        _master_key()
        return True
    except SecretsUnavailable:
        return False


def seal(plaintext: str, *, org_id: str) -> tuple[bytes, bytes]:
    """Encrypt. Returns (ciphertext, nonce).

    `org_id` is authenticated but not encrypted: it binds the ciphertext to the
    tenant it belongs to, so a row copied sideways fails to open.
    """
    if AESGCM is None:
        raise SecretsUnavailable(
            "The 'cryptography' package is not installed. Add it to "
            "requirements.txt — credentials are not stored without it.")
    if not plaintext:
        raise ValueError("nothing to encrypt")
    nonce = os.urandom(12)                             # never reused, never derived
    ct = AESGCM(_master_key()).encrypt(
        nonce, plaintext.encode(), org_id.encode())
    return ct, nonce


def reveal(ciphertext: bytes, nonce: bytes, *, org_id: str) -> str:
    """Decrypt. Only the outbound-request path may call this.

    Raises on any tampering, on a wrong tenant, and on a rotated master key —
    all three are the same signal to the caller: this credential cannot be
    used, ask the customer to re-enter it.
    """
    if AESGCM is None:
        raise SecretsUnavailable("The 'cryptography' package is not installed.")
    return AESGCM(_master_key()).decrypt(
        bytes(nonce), bytes(ciphertext), org_id.encode()).decode()


def hint(plaintext: str) -> str:
    """What we are willing to show back: shape and last four.

    Enough for a person to recognise which key they pasted, useless to anyone
    who reads it. Deliberately never the first characters — provider prefixes
    (`sk-`, `ABSK`, `AIza`) plus a length are a meaningful head start for an
    attacker enumerating a leaked partial.
    """
    p = (plaintext or "").strip()
    return f"…{p[-4:]}" if len(p) >= 8 else "…"
