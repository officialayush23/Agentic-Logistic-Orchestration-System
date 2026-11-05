"""Shared plumbing for the specialist agents."""
from __future__ import annotations

import json
from typing import Any

from .. import agent as domain
from ..core import set_org


def clean(x: Any) -> Any:
    """Make a value checkpoint-safe (datetimes, Decimals, Records → JSON types)."""
    return json.loads(json.dumps(x, default=str))


def enter(state: dict) -> tuple[str, str, dict]:
    """Every agent turn: set the tenant, rehydrate the domain layer from the checkpoint.

    The checkpoint is the source of truth. The domain functions in agent.py keep
    a per-process working dict; after a restart it is rebuilt from `ctx`, so an
    approval or a goods receipt days later continues with exactly the facts the
    thread had.
    """
    org = state.get("org_id") or "NEXA"
    set_org(org)
    iid = state["incident_id"]
    st = domain._STATE.get(iid)
    if st is None:
        st = dict(state.get("ctx") or {})
        st.setdefault("incident_id", iid)
        st.setdefault("steps", [])
        st.setdefault("tool_calls", 0)
        domain._STATE[iid] = st
    return org, iid, st


def ctx_of(st: dict) -> dict:
    return clean({k: v for k, v in st.items() if k not in ("steps",)})
