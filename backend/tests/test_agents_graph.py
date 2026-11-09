"""Multi-agent graph: routing policy, interrupt/resume, checkpoints, memory, guards.
Runs offline: in-process checkpointer/store, database calls stubbed."""
import asyncio, os, contextlib
os.environ.setdefault("DATABASE_URL", "postgresql://x:y@localhost:1/x")
os.environ["AGENT_MEMORY"] = "memory"

import pytest
from langgraph.types import Command

from app.agents import graph as G, memory, approval as A
from app.agents.state import step
from app import guards


class FakeConn:
    async def execute(self, *a, **k): return None
    async def fetchval(self, *a, **k): return None
    async def fetch(self, *a, **k): return []
    async def fetchrow(self, *a, **k): return None


@contextlib.asynccontextmanager
async def fake_db():
    yield FakeConn()


def stub(name, phase, **extra):
    async def fn(state):
        return {"phase": phase, "trail": [step(name, f"{name} did its job")], **extra}
    return fn


@pytest.fixture
def patched(monkeypatch):
    monkeypatch.setattr(G, "sentinel", stub("sentinel", "detected"))
    monkeypatch.setattr(G, "investigator", stub("investigator", "investigated",
        evidence={"contradictions": [{"id": "PO-7712", "supplier_id": "SUP-21"}], "contradictions_settled": False}))
    async def treasurer(state):
        if state["phase"] == "investigated":
            return {"phase": "money_secured", "evidence": {"contradictions_settled": True},
                    "money": [{"po_id": "PO-7712", "state": "hold_voided"}], "trail": [step("treasurer", "void")]}
        return {"phase": "awaiting_goods", "money": [{"po_id": "PO-A9001", "state": "funds_held"}],
                "trail": [step("treasurer", "hold")]}
    monkeypatch.setattr(G, "treasurer", treasurer)
    monkeypatch.setattr(G, "liaison", stub("liaison", "communicated"))
    monkeypatch.setattr(G, "sourcing", stub("sourcing", "planned",
        plan={"label": "Formosa AIR", "requires_approval": True, "plan_id": 1}))
    monkeypatch.setattr(G, "procurement", stub("procurement", "procured",
        purchase_orders=[{"po_id": "PO-A9001", "mode": "AIR"}]))
    monkeypatch.setattr(A, "db_conn", fake_db)
    async def noop(*a, **k): return None
    monkeypatch.setattr(A, "emit", noop)
    monkeypatch.setattr(A, "enter", lambda s: ("NEXA", s["incident_id"], {}))


def test_routing_policy_is_deterministic():
    s = {"trigger": "risk", "phase": "investigated", "evidence": {"contradictions": [1]}}
    assert G.route(s)[0] == "treasurer"
    s["evidence"]["contradictions_settled"] = True
    assert G.route(s)[0] == "liaison"
    assert G.route({"trigger": "risk", "phase": "planned", "plan": {"requires_approval": True}})[0] == "approval"
    assert G.route({"trigger": "risk", "phase": "planned", "plan": {}})[0] == "procurement"
    assert G.route({"trigger": "goods_received", "phase": "start"})[0] == "treasurer"
    assert G.route({"trigger": "goods_received", "phase": "settled"})[0] == "verifier"
    assert G.route({"trigger": "risk", "phase": "planned", "turns": 99})[0] == "__end__"


def test_full_incident_with_human_interrupt(patched):
    async def run():
        await memory.close_memory()
        saver, store = await memory.open_memory(force_memory=True)
        g = G.build().compile(checkpointer=saver, store=store)
        cfg = {"configurable": {"thread_id": "INC-T1"}}
        out = await g.ainvoke({"incident_id": "INC-T1", "org_id": "NEXA", "trigger": "risk",
                               "phase": "start", "turns": 0}, cfg)
        snap = await g.aget_state(cfg)
        assert snap.next == ("approval",)                         # stopped for a human
        assert snap.tasks[0].interrupts[0].value["action"] == "Formosa AIR"
        agents = [t["agent"] for t in snap.values["trail"] if t["agent"] != "supervisor"]
        assert agents == ["sentinel", "investigator", "treasurer", "liaison", "sourcing"]

        # A fresh graph object on the same checkpointer resumes the same thread (restart-safe).
        g2 = G.build().compile(checkpointer=saver, store=store)
        out = await g2.ainvoke(Command(resume={"decision": "approve", "note": "ok"}), cfg)
        assert out["phase"] == "awaiting_goods"
        assert [m["state"] for m in out["money"]] == ["hold_voided", "funds_held"]
        hist = [h async for h in g2.aget_state_history(cfg)]
        assert len(hist) > 10                                     # every turn checkpointed
    asyncio.run(run())


def test_long_term_supplier_memory():
    async def run():
        await memory.close_memory()
        await memory.open_memory(force_memory=True)
        for _ in range(2):
            p = await memory.remember_supplier("NEXA", "SUP-21", "contradiction", "lied")
        assert p["counts"]["contradiction"] == 2 and p["trust"] == "proof_only"
        await memory.remember_episode("NEXA", "INC-9", {"component_id": "COMP-104", "outcome": "resolved"})
        assert (await memory.recent_episodes("NEXA"))[0]["incident_id"] == "INC-9"
    asyncio.run(run())


def test_guards_math():
    from datetime import datetime, timedelta, timezone
    due = datetime(2026, 11, 1, tzinfo=timezone.utc)
    v = guards.late_credit({"promised_date": due, "ld_pct_per_week": 5, "ld_cap_pct": 10}, 4200,
                           delivered_at=due + timedelta(days=6))
    assert v.outcome == "adjust" and v.amount_usd == 180.0
    qv, acc, ret = guards.quality_holdback({"retention_pct": 10}, 700, 680, 7000)
    assert acc == 6800.0 and ret == 680.0
    assert guards.norm_invoice("ZH-INV-55120-A") == guards.norm_invoice("ZH/INV/55120")
    ok, r = guards.early_pay(2, 10, 30)
    assert ok and abs(r - 0.3724) < 0.001


def test_no_plan_escalates_to_human():
    assert G.route({"trigger": "risk", "phase": "no_plan"})[0] == "approval"
    assert G.route({"trigger": "risk", "phase": "closed"})[0] == "__end__"


def test_trust_rules():
    from app.agents.memory import _trust
    assert _trust({"late": 1, "defect": 1}) == "watch"
    assert _trust({"contradiction": 1}) == "proof_only"
    assert _trust({"late": 2, "defect": 2}) == "proof_only"
    assert _trust({"good_delivery": 3}) == "trusted"
