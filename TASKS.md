# DisruptionOps — Build Tasks

**Product:** Autonomous supply-chain control agent for NEXA Mobility Systems, a Pune-based
Tier-1 automotive electronics manufacturer.

**Theme:** Apple-style glassmorphism. Black + lime (dark), white + lime (light). Both modes.

Ordered by **score-per-hour**, not by architectural elegance. Ship top-down.

---

## RULE 0 — Do not rebuild the schema

The N3 conceptual model is better on paper. Renaming `suppliers` → `supplier`,
`inventory` → `inventory_balance` etc. is a cascade through solver, injector, scorer, seed,
and every endpoint — all currently tested and working.

**Instead:** additive tables for new loops + a thin display layer for naming.
Same user-visible outcome, ~2% of the risk.

**Also:** SMTP to real recipients is out. The PS requires a simulated sandbox and warns against
connecting real email. Keep the email *aesthetic* (From/To/Subject, delivery states) — drop the
transport. "One config flag from real SMTP" is a stronger claim than shipping it.

---

## T1 — Reactive controller  ⭐ HIGHEST SCORE IMPACT

Today a human clicks **Solve**. That reads as not-agentic. This is 40% (autonomous decision) +
30% (robustness) of the summary rubric.

```
Event lands
   ↓
Risk detector  (deterministic)
   ↓
Does this threaten production?   ── no ──▶  log + monitor
   ↓ yes
Open incident automatically
   ↓
Wake agent
```

- [ ] `app/risk.py` — `assess(event) -> RiskVerdict{severity, threatened_orders, hours_to_impact}`
- [ ] Hook into `injector.apply_event` — every event runs through the detector
- [ ] Auto-open incident when severity ≥ high; auto-attach to existing incident otherwise
- [ ] Emit `RISK_DETECTED` and `AGENT_WOKE` audit events
- [ ] Agent runs the evidence pack automatically on wake (no button)
- [ ] Remove **Solve** as the primary trigger; keep it as a manual re-run

**Done when:** injecting S1 produces a recovery plan with zero clicks.

---

## T2 — Communication threads (supplier · warehouse · carrier)

The most *visible* agentic behaviour. Agent writes, supplier replies, agent catches the lie.

### Schema (additive)

```sql
create table message_threads (
  id bigserial primary key,
  incident_id text,                       -- soft ref, no FK (audit rule)
  counterparty_type text not null,        -- supplier | warehouse | carrier | internal
  counterparty_id text,
  subject text not null,
  status text not null default 'open',
  created_at timestamptz default now()
);

create table messages (
  id bigserial primary key,
  thread_id bigint references message_threads(id) on delete cascade,
  direction text not null,                -- outbound | inbound
  author_type text not null,              -- agent | supplier | warehouse | carrier | human
  author_id text,
  body text not null,
  delivery_state text not null default 'sent',
  -- draft | sent | delivered | replied | awaiting_response | expired | escalated
  sent_at timestamptz default now(),
  responded_at timestamptz,
  simulated_at_seconds numeric(12,2)
);
```

- [ ] `send_supplier_message` tool → writes outbound + schedules a simulated reply
- [ ] Supplier reply simulator with per-supplier persona (SUP-21 lies; SUP-42 is straight)
- [ ] Parallel RFQ: agent contacts 3 suppliers via `asyncio.gather`
- [ ] **Follow-up loop** — no reply within N simulated minutes → chase → chase again → lower confidence → route around
- [ ] Delivery states drive UI (`awaiting_response` shows a spinner)
- [ ] Every message emits an audit event

### UI — Communication Center
- [ ] One chronological operational thread per incident: supplier + warehouse + carrier + agent + human
- [ ] Email-style rendering (From / To / Subject / body / timestamp)
- [ ] `sheet` component, opens from the incident rail

**Done when:** the demo shows the agent asking SUP-21 for pickup time, SUP-21 claiming dispatch,
and the agent flagging the contradiction — as a readable conversation.

---

## T3 — Human-readable naming layer

Nobody should have to hold `PROD-882` in their head.

```sql
alter table components add column display_name text;   -- 'Motor Driver IC'
alter table components add column part_number text;    -- 'MDIC-7701'
alter table components add column category text;       -- 'Power Electronics'

create table products (
  id text primary key,
  name text not null,          -- 'EV Drive Controller'
  family text                  -- 'EV Power Electronics'
);
alter table production_orders add column product_id text references products(id);
alter table suppliers add column legal_name text;      -- 'Shenzhen Motion Electronics'
```

- [ ] Backfill in `seed.sql`
- [ ] `/api/*` returns display names alongside IDs
- [ ] **UI rule: name first, ID as grey metadata.** Never an ID alone in a heading.

Before → after:

```
PROD-882 requires COMP-104
→ High-priority EV Drive Controller order needs 460 more Motor Driver ICs
  COMP-104 · MDIC-7701 · Power Electronics
```

---

## T4 — Warehouse loop + Warehouse UI

Physical reality contradicting ERP. Closes the strongest loop after supplier.

```sql
create table warehouse_tasks (
  id bigserial primary key,
  facility_id text references warehouses(id),
  component_id text references components(id),
  incident_id text,
  task_type text not null,
  -- physical_count | usable_stock_verification | quality_hold_check
  -- release_stock | receive_shipment | verify_lot
  priority text not null default 'normal',
  status text not null default 'open',      -- open | in_progress | done | cancelled
  requested_by text not null default 'agent',
  instructions text,
  result_payload jsonb,
  created_at timestamptz default now(),
  completed_at timestamptz
);
```

Keep the three concepts separate — **message = communication · task = requested action · event = immutable history.**

- [ ] `request_warehouse_task` agent tool
- [ ] Warehouse route `/warehouse` — inventory · inbound · tasks · quality holds
- [ ] Operator can submit a physical count → becomes an event → agent recalculates coverage live
- [ ] Quality hold: received ≠ usable
- [ ] No map on the warehouse screen. Map belongs to Command Center.

**Demo moment:** warehouse submits "390 usable, 410 quarantined" → Command Center KPI updates in
real time → agent re-plans. That is the loop closing on screen.

---

## T5 — Verification loop (incident lifecycle)

Executed ≠ resolved. Prevents a fake "problem solved".

```
OPEN → INVESTIGATING → PLANNED → EXECUTING → MONITORING → VERIFIED?
                                                    ├── yes → CLOSED
                                                    └── no  → REOPEN → replan
```

- [ ] Extend `incident_status` enum
- [ ] Incident closes only when **usable** stock covers the requirement
- [ ] Auto-reopen when a recovery PO is itself delayed or fails inspection
- [ ] `INCIDENT_REOPENED` audit event

---

## T6 — Approval Center

- [ ] `/approvals` route
- [ ] Approve · Reject · **Modify** ("approve SUP-42 only, drop SUP-33")
- [ ] Modify writes a *constraint* into agent state → invalidates plan → forces replan
- [ ] LangGraph `interrupt()` resume on approve
- [ ] Escalation chain on no acknowledgement (compressed: T+5 simulated minutes)

Human feedback must change agent state, not sit as a comment.

---

## T7 — Command Center redesign + light/dark

Current UI is card-heavy and too dense. Target: more whitespace, bigger type, fewer cards.

```
┌──────────────────────────────────────────────────────────────┐
│ Command Center              Pune Plant · LIVE · 19:24 IST    │
├──────────────────────────────────────────────────────────────┤
│  🔴 1 CRITICAL        4.3 DAYS           ₹67,500             │
│  Production risk      Production cover   Best recovery       │
├────────────────────────────────┬─────────────────────────────┤
│         LIVE SUPPLY MAP        │ CURRENT INCIDENT            │
│                                │ Motor Driver IC             │
│                                │ 460 units exposed           │
│                                │ Agent is working…           │
├────────────────────────────────┴─────────────────────────────┤
│ AGENT ACTIVITY                                               │
│ 19:22 ✓ Delay detected                                       │
│ 19:23 ⚠ Tracking contradiction detected                      │
│ 19:23 ◌ Evaluating alternatives                              │
└──────────────────────────────────────────────────────────────┘
```

Sidebar groups:

```
OPERATIONS      Command Center · Live Network · Incidents
DECISIONS       Decision Explorer · Approvals · Audit Trail
INTELLIGENCE    Ask the Agent · Agent Activity · Performance
WAREHOUSE       Inventory · Tasks · Inbound
```

- [ ] shadcn `sidebar` block (collapsible groups)
- [ ] Theme toggle — `switch` + `dropdown-menu`, class on `<html>`, persisted
- [ ] **Verify light mode.** Glass tokens are currently tuned for dark only.
- [ ] Agent activity in plain language, not event types:
      *"Checked usable inventory"* not `INVENTORY_QUERIED`
- [ ] Expandable **"Why did the agent do this?"** → prose reasoning
- [ ] **Developer Trace** toggle → raw JSON, node names, tool counts, latency

---

## T8 — Geography  ✅ done

Mapbox GL, not MapLibre — the user supplied a Mapbox token, and Mapbox's own tile CDN is
one less thing to go wrong on conference wifi.

**The schematic stays the default.** Real geography is a second opinion, not the primary
view: an operator reading lanes does not need coastlines, and the SVG projection renders
instantly with no network at all.

- [x] `NetworkFlow.jsx` — SVG projection with rich hover detail on every node, lane and
      shipment (supplier trust, fastest lane, contradiction count, transport modes,
      components supplied, active shipments and their value)
- [x] `MapView.jsx` — Mapbox GL, **Live Network screen only**, behind a Schematic/Geography
      toggle
- [x] Lazy chunk: the ~800 kB map engine never enters the main bundle, and only loads if
      someone actually opens the map
- [x] Automatic fallback to the schematic when the token is missing, the chunk fails, or
      tiles are unreachable — with a quiet note saying why
- [x] Quadratic-bezier lane arcs, tone-coded by state, red ping on contradicted suppliers
- [x] Mapbox layout CSS inlined in `index.css` so the map does not depend on the vendor
      stylesheet resolving
- [ ] Animated shipment position along the route (deterministic: position is a function of
      simulated elapsed time, never random GPS)
- [ ] `shipment_positions` table wired to the map
- [ ] Geographic contradiction: supplier says in-transit, GPS shows no movement

> Conference wifi risk is handled by construction — if tiles fail the schematic takes over
> automatically and the demo continues. The map can never take the demo down.

---

## T8b — Decision Explorer v2  ✅ done

- [x] Production-run picker (names and OEM customers, not typed `PROD-882`) — opens on the run
      in the most trouble
- [x] **Comparison matrix**: every costed option as a column, criteria as rows — weighted score,
      units covered, arrival vs deadline, total cost, the three rubric sub-scores, authority,
      who supplies it, and the reasoning
- [x] Refusals are first-class: "considered and refused" with the human reason per supplier
- [x] **What-if**: click a supplier to knock it out. `exclude` removes it from the candidate pool
      *before* scoring, so the plan re-forms around the loss — split-sourcing re-plans instead of
      a row simply disappearing
- [x] Deltas against the real plan (cost, arrival, score), coloured by whether they hurt
- [x] Simulations never write to the audit log (`record` is ignored when `exclude` is set)
- [x] Backend: `solve_for_production_order(..., exclude=[...])`, `GET /api/solve/{id}?exclude=A,B`,
      response gains `suppliers_in_play` and `excluded`

Verified against the solver directly: knocking out the chosen supplier re-plans onto the next
viable one; knocking out both viable ones correctly returns **Do nothing — the line stops**,
rather than inventing a recovery.

---

## T9 — Production ↔ Procurement loop  ✅ done

Until this, the agent had exactly one answer to a shortage: **buy more**. Now it has a second
lever — ask whether a lower-priority run can wait, and spend the freed units instead of money.

**How it is modelled honestly.** Usable stock is a shared pool, and each open run holds a claim
on it (`production_orders.allocated_units`). A shortfall may only count stock nobody else has
claimed. Releasing a claim is exactly what a reschedule does — no hand-waving about units
appearing from nowhere.

- [x] `allocated_units`, `original_deadline`, `rescheduled_at`, `rescheduled_reason` on
      `production_orders`
- [x] `NEED_SQL` is allocation-aware: available = pool − claims held by other live runs
- [x] `RESCHEDULE_SQL` finds runs that could stand down — strictly lower priority, holding units,
      and with real slack in their own deadline (the delay we ask for *is* that slack, capped at
      14 days)
- [x] New option kind `reschedule_other`, scored on the same weights as everything else, with the
      residual purchase costed inside it
- [x] **Always requires approval**, however little it costs — the delay lands on another
      customer, and that is not a trade an agent makes alone. The approval reason says so in
      those words instead of quoting a spending limit.
- [x] `POST /api/production/reschedule` for the operator-driven path; agent-driven execution
      stands the run down *before* buying the smaller residual, and replans if someone else
      rescheduled it first
- [x] `PRODUCTION_RESCHEDULED` audit event, and the reschedule re-wakes the agent so it never
      holds a stale plan
- [x] Decision Explorer: "Where units come from" credits the released stock, and a **"Who else
      pays"** row names the customer and the days — the cost that is not money
- [x] Seed: **PROD-888**, low-priority aftermarket spares for Shakti Auto, holding 300 units of
      COMP-104 with 17 days of slack

Verified end to end: for PROD-882 the loop produces *"Delay Smart Controller Unit for Shakti Auto
+ buy 160"* at **₹43,200 / score 0.657**, beating the cheapest straight purchase at **₹86,700 /
score 0.582** — and still stops for a human.

---

## T10 — Supplier learning loop  ✅ done

Trust used to be a one-way ratchet: every contradiction subtracted 0.25, every quality failure
0.15, and nothing ever earned any of it back. A supplier who slipped once in March stayed
punished forever, and one who quietly delivered forty times on schedule accumulated no credit.

- [x] `supplier_trust()` — the arithmetic lives in **SQL**, so Python can never drift from it.
      Laplace-smoothed keep rate toward the seeded prior, minus 0.20 per contradiction, 0.10 per
      quality failure, 0.02 per average day late
- [x] `reliability_events` — every movement with a before, an after, and a reason. Without it the
      score is an opinion; with it, it is an argument the operator can check
- [x] `app/learning.py` — the **only** writer of `supplier_memory`. Three call sites that each
      hand-rolled their own subtraction now record what happened and let the score follow
- [x] `on_goods_received()` closes the loop: on-time delivery is the one event that raises trust,
      measured in hours against the promise, never truncated days
- [x] `supplier_effective` recomputes rather than reading whatever the last subtraction left
- [x] `GET /api/suppliers/{id}/reliability` returns the score *and* its history
- [x] `SUPPLIER_LEARNED` audit events, and hover cards that show why the number moved

---

## UX pass — from system console to operations copilot

The critique was right: the product exposed what the agent was doing rather than answering what
an operator actually asks. Reordered around **situation → impact → recommendation → your action
→ evidence**.

- [x] **NOW bar** — persistent strip: what needs you, what the agent is doing, days of cover,
      next delivery. Always the same place, always the same question answered
- [x] **Overview rebuilt into three zones** — left: an action *queue* (not a feed) that shrinks as
      you work it; centre: one operational story with the have → need → short arithmetic in
      plain numbers; right: what the AI is doing in three tenses — done, waiting on, next
- [x] **⌘K command bar** — "Ask the Agent" was a page you had to leave your work to reach, which
      is backwards. Now it is one keystroke from anywhere, does navigation too, and shows what
      the answer was grounded in
- [x] **Navigation regrouped** by user question, not architecture: Operations · AI agent ·
      Execution · Governance
- [x] **Whitespace pass** — panel headers and card bodies were all running dense; loosened
      consistently across every screen
- [x] **Hovers answer "and what did you do about it?"** — both the schematic and the Mapbox view
      now show the agent's last five actions with that supplier, the delivery record, and why the
      trust score moved

### Still to do — the rest of the critique

- [x] Decision Explorer led by the recommendation, with the scoring matrix behind a drill-down
- [x] Communications as an inbox: `Needs reply` / `AI conversations` / `Suppliers` /
      `Warehouse` tabs, and an explicit autonomous / draft-only / human-takeover mode per
      thread
- [x] Warehouse reduced to *My Tasks* — a warehouse operator never sees a weighted score
- [x] Audit Trail split into Business / Agent / Technical views
- [ ] Incident page as the main operational workspace (header → what changed → recommendation →
      collapsed activity)
- [ ] Network dims everything not on the affected path when a disruption is live
- [ ] Simulation transport controls — play, pause, speed, scrub

---

## T11 — Supplier portal ✅ done

The third actor. Until this, "the supplier claims dispatch and the agent catches it" was a
persona firing a hardcoded string at a timer — a **scripted liar proves nothing about an
agent**, and a judge had no way to disagree with it. Now a person sits at
`/supplier/SUP-21` and decides whether to tell the truth.

- [x] `/supplier/<id>` and `/supplier` (directory), lazy-loaded out of the ops bundle
- [x] Structured quote — qty · price · lead · mode · MOQ · certifications — composed into
      **prose** before it is sent, because the parser has to read an offer out of sentences
      the way it will in production
- [x] **Applied quotes write through to `supplier_catalog`**, which is what the solver
      reads. Drop your price at the portal and the recommendation moves on the operations
      screen. An offer that cannot change the plan is theatre.
- [x] Hedged reply · decline · free text — the three non-quote answers, each with a
      different downstream consequence
- [x] Dispatch claims, including false ones. Contradiction detection extended to fire when
      the **claim arrives after** the carrier data, not just before — the old code only
      checked one direction, and a portal user does it in the other one.
- [x] **Presence beats the script**: while a portal is open that supplier's persona stands
      down and the agent emits `AWAITING_COUNTERPARTY` instead of inventing an answer.
      Close the tab, personas resume, unattended demo still runs.
- [x] Certifications asserted at the portal are recorded as a *claim* and never written to
      `suppliers.certifications`. `CERTIFICATION_CLAIM_UNVERIFIED` says so out loud.
- [x] The supplier sees their own trust score and its history — the number they can move,
      and the only thing that raises it is delivering when they said they would

---

## T12 — Thread autonomy ✅ done

"The agent emailed my supplier in my name" is the single most common reason a buyer refuses
to switch a tool like this on. Autonomy is a property of the **conversation**, not a global
switch.

- [x] `message_threads.autonomy` — `autonomous` | `draft` | `human`
- [x] Draft mode holds the message at `delivery_state='draft'` and emits `MESSAGE_DRAFTED`;
      a draft is deliberately **not** logged as `MESSAGE_SENT`, because a sentence in the
      audit trail that never left the building is how an auditor stops trusting the rest of it
- [x] Human mode logs what it *would* have written (`MESSAGE_SUPPRESSED`) rather than going
      silent
- [x] Release a draft, edited or not — an edit is recorded as the human's, not the agent's

---

## T13 — The human input queue ✅ done

`HUMAN_INPUT_REQUIRED` was already being emitted with a confidence and three options
attached, and **nothing rendered it** — the agent was politely asking a question into a log
file.

- [x] `human_input_requests` table with a status, so a question can be answered
- [x] Deduped while open on (kind, thread, supplier) — asking the same question four times
      is how a queue becomes something people stop reading
- [x] Every option **does** something and says what before you press it: chase for a firm
      commitment · take the thread over · exclude that supplier and replan
- [x] Surfaced in the action queue and the NOW bar alongside approvals, because a question
      it declined to answer is as blocking as a spend it declined to make

---

## T14 — Decision intelligence ✅ done

The Decision Explorer is a comparison. The person who signs asks a different five questions.

- [x] `intelligence.py` — evidence → conclusion → action → why → confidence, assembled from
      rows that already exist. **No LLM.**
- [x] Every evidence row names what it was **checked against** and carries a verdict:
      corroborated · contradicted · single source · not a commitment · unanswered
- [x] Confidence is arithmetic: starts at 1.00, published deductions per verdict, the
      subtractions listed so the number can be rebuilt by hand and argued with
- [x] "What would change it" — the specific act that lifts confidence, not a platitude

---

## T15 — Scenario builder ✅ done

- [x] `GET /api/scenarios/context` — the world in human-readable labels, with the foreign
      keys the UI needs to make one dropdown narrow another
- [x] `EVENT_SCHEMA` is the single source the form, the validator and the reference panel
      are all generated from, so they cannot drift
- [x] Builder tab: pick a part → every shipment list narrows to it; pick a shipment → the
      supplier shows locked, derived from the order
- [x] `POST /api/scenarios/validate` — two passes: shape against the schema, then every ID
      it names must be a row that exists. Errors name the event, the field, and what was
      expected.
- [x] JSON tab with a schema reference and click-to-copy real IDs
- [x] **Create a test supplier** — build your own trap ("the cheapest one has no AEC-Q100")
      without editing the seed. Flagged `origin='test'`, gone on reset.
- [x] Two new event types, `supplier_reply` and `warehouse_reply`, which inject prose down
      the *same* path a human at a portal uses
- [x] Every built-in scenario now carries **why it exists** and **what to watch for**
- [x] Three buttons: Run · Reset · Hard reset (confirmed, and honest about what it destroys)
- [x] Reset now also clears threads, messages, recovery plans, constraints, warehouse tasks
      and open questions — all of which held no foreign key into the seeded world and were
      quietly surviving it. A "clean" world with four stale conversations in it is worse
      than not resetting at all.

---

## T16 — Route network map: multi-modal, accepted **and** rejected  ⭐ COMPETITIVE GAP

Added after scanning Team Scalar's *Reroute* (team-scalar.vercel.app). Their strongest asset
is a world map with mode-labelled route options and a comparison table; ours is the reasoning
underneath. This task closes the visual gap without adopting their weakness — their
"Leg-by-Leg Intermodal Breakdown" renders **0 Segments**, i.e. the table that would prove the
route is empty. Ours must never be able to render empty.

The substrate already exists and is not being shown:

- `transport_mode` enum is `AIR | SEA | RAIL | ROAD` (0001_init.sql:16)
- `supplier_lanes(supplier_id, warehouse_id, mode, transit_days, freight_cost)` — a supplier
  can have several lanes, and the solver already evaluates every one
- `suppliers.lat/lng` and `warehouses.lat/lng` exist (0004_geo_coords_for_network_view.sql)
- `solver._hard_filter` already produces a `Rejection(supplier_id, supplier_name, constraint,
  human_reason, detail)` for every refusal, including `HAZMAT_NO_AIR` with the mode in `detail`
- `MapView.jsx` already draws arcs on Mapbox; `NetworkFlow.jsx` is the schematic fallback

What is missing is that the map shows *shipment state*, never *decision state*. The agent
considers a dozen lanes and refuses most of them; the operator sees none of that geography.

### T16.1 — Lane-level verdicts out of the solver

`_hard_filter` dedupes rejections by `(supplier, constraint)` and then **drops any rejection
for a supplier that is viable on another lane** (solver.py:145). That is correct for the
Decision Explorer — one clean reason per supplier — and wrong for a map, where a Shenzhen
supplier reachable by SEA but refused by AIR is exactly the picture worth drawing.

- [ ] Keep `rejections` (deduped, per supplier) exactly as it is — the Explorer, evaluation
      and `intelligence.py` all read it and must not change
- [ ] Add `lane_rejections`: the pre-dedupe list, one row per (supplier, mode), each carrying
      `mode`, `constraint`, `human_reason`, `detail`
- [ ] Add `lane_candidates`: every lane that survived the filter, with `mode`,
      `lead_time_hours`, `freight_cost`, `unit_price`, and whether it is in the chosen plan
- [ ] Verdict per lane is one of: `chosen` · `considered` · `rejected`

### T16.2 — `GET /api/routes` (scoped to the active run)

- [ ] One payload the map can draw without a second call: `plant{lat,lng}`, and
      `lanes[]` of `{supplier_id, supplier_name, from{lat,lng}, to{lat,lng}, mode, verdict,
      constraint, human_reason, hours, freight_cost, landed_cost, legs[]}`
- [ ] `legs[]` is the intermodal breakdown: `{seq, mode, from, to, depart_sim, arrive_sim,
      hours}`. **A lane with zero legs is a bug, not an empty state** — synthesise the single
      direct leg from the lane itself rather than shipping an empty table
- [ ] Empty state is `null` run, not zeros (same rule as `_active_run_id`)

### T16.3 — Map: mode + verdict, expandable

- [ ] Mode is line *shape*, verdict is line *colour* — the two never share a channel:
      AIR long-dash great-circle · SEA solid bend · RAIL short-dash · ROAD dotted straight
- [ ] Verdict colour: chosen = lime, considered = muted blue, rejected = red at 40% opacity
- [ ] Rejected lanes are drawn **by default**. The refusals are the differentiator; hiding
      them to keep the map tidy throws away the whole argument
- [ ] Click a lane → side panel with the constraint, the human reason, and the numbers that
      produced it. Hover → **the reason, not the stats**: chosen reads "on time by 14h,
      Rs 2.1L landed, reliability 0.91"; rejected reads the rule that killed it, in the
      *same sentence* the Decision Explorer uses. A judge who reads the map and then the
      explorer must not find two different explanations of one refusal
- [ ] Filter chips: mode (4) × verdict (3), plus "chosen only" for the screenshot
- [ ] Expand to fullscreen (`Esc` closes, state preserved), and it must survive token-less
      Mapbox by falling back to `NetworkFlow` with the same colours and filters
- [ ] Legend that names the four modes and the three verdicts. Nothing on the map unexplained

### T16.4 — Route comparison table (under the map)

- [ ] Columns: option · path with mode per leg · transit hours · landed cost · Δ vs baseline ·
      constraint verdict · action. Baseline row = do-nothing, and it is always present
- [ ] Δ vs baseline in **both** hours and rupees, signed, and a cost *increase* is never
      printed in the savings column
- [ ] Row expands into the leg breakdown from T16.2. Never renders "0 segments"

### T16.5 — Test cases  ⭐ this is the half that makes the map trustworthy

No pytest harness exists yet. `solver.py` is pure functions over dicts — no DB needed — so the
first tests are cheap and cover the part judges will interrogate.

- [ ] `backend/tests/` + pytest in requirements, `pytest -q` green in one command
- [ ] `test_lane_verdicts.py`
      - hazmat component: the AIR lane is rejected `HAZMAT_NO_AIR`, the SEA lane of the *same
        supplier* is still `considered` (this is the case the current dedupe hides)
      - a supplier missing `AEC-Q100` is rejected on **every** lane, not one
      - MOQ and OVER_BUDGET each produce a rejection carrying the numbers in `detail`
      - every lane in the output has a `mode` from the enum and a non-empty `human_reason`
        when rejected
- [ ] `test_routes_endpoint.py` (async, against a seeded test DB or a stubbed conn)
      - every lane has both endpoints with real coordinates — a lane missing `lat/lng` must
        fail the test, not silently vanish from the map
      - `legs[]` is non-empty for every lane returned
      - with no active run the endpoint returns `null`, not an empty world that reads as zero
- [ ] `test_scenario_multimodal.py` — a new scenario `S-MODE`: sea lane blocked, rail slower
      but compliant, air cheapest on time but hazmat-prohibited. Assert the agent picks rail,
      that air appears on the map as rejected with the hazmat reason, and that the approval
      gate fires if the rail option crosses the threshold
- [ ] Frontend: one Playwright pass — inject `S-MODE`, expand the map, assert a red AIR lane
      is present, click it, assert the reason panel names the constraint

**Done when:** injecting `S-MODE` draws four modes on one map, the refused air lane is visible
and clickable with the hazmat rule as its reason, the comparison table shows a non-empty leg
breakdown for every row, and `pytest -q` proves the verdicts rather than the screenshot doing it.

---

## T17 — Two problems at once  ⭐⭐ BIGGEST RISK AND BIGGEST DIFFERENTIATOR

Every scenario we have ever run is one incident, one component, one trap. The system has
never been asked to make two decisions at the same time. It can — and when it does, the
authority boundary leaks.

Neither competitor models contention at all. A control tower that can say *"this order lost
the last 400 units to that order, and here is why that was right"* is a thing no screenshot
of theirs can answer.

### T17.0 — BUG: the emergency budget is not a ceiling under concurrency

`agent.py:38` keeps `_RUNNING` as one asyncio task **per incident**, so runs are genuinely
concurrent. `solver.py:438` computes the budget like this:

```python
spent = float(await conn.fetchval(
    "select coalesce(sum(total_value),0) from purchase_orders where created_by_agent") or 0)
budget_left = EMERGENCY_BUDGET_INR - spent          # solver.py:213
```

`spent` counts only purchase orders **already placed**. Nothing holds money between scoring
an option and committing it. Two live incidents each read the same Rs 5,00,000, each approve
Rs 4,00,000, and both pass `OVER_BUDGET`. The constraint we present on stage as a hard
authority boundary is not one.

The same hole exists in units: `CANDIDATE_SQL` (solver.py:351) reads `sc.available_quantity`
raw, so two incidents can allocate the same 800 units from the same supplier. (`NEED_SQL`
nets *plant* stock against competing claims — supplier availability has no equivalent.)

- [ ] Treat this as a bug with a failing test first, not as a feature request

### T17.1 — Claims: reserve, don't just read

Additive table, per RULE 0.

```
resource_claims(
  id, incident_id, scenario_run_id,
  kind          -- 'budget' | 'units'
  supplier_id   -- null for budget
  amount        -- rupees, or units
  state         -- 'held' | 'placed' | 'released'
  created_at, released_at, reason)
```

- [ ] A chosen option **holds** its budget and units the moment it is chosen, not when the PO
      is placed. Approval pending is still a claim — that is the whole point
- [ ] `budget_left = EMERGENCY_BUDGET − placed − held`, and `_hard_filter` reads that
- [ ] Supplier availability in `CANDIDATE_SQL` is netted against `held` claims the same way
- [ ] A claim is released on reject, on expiry, or on a reschedule that gives the stock back.
      Every release is an audit event with the reason — a silent release is a leak
- [ ] The `OVER_BUDGET` rejection gets richer and more honest: "Rs 1,20,000 of the remaining
      budget is held by INC-002 for a critical line."

### T17.2 — Triage: which problem gets the money

When two incidents want the last 400 units, something must choose. **It is not the LLM.**
A deterministic, stated, arguable rule, in code, in one function:

1. hours to line stop, ascending — the line that stops first wins
2. then production-order priority (critical · high · medium · low)
3. then units at risk
4. then order value

- [ ] `triage.py` — `rank(incidents) -> ordered list`, pure function, unit-tested
- [ ] The agent processes in rank order and claims in rank order
- [ ] **The loser's rejection names the winner**: "lost this stock to INC-002, which stops a
      critical line 9h sooner." A refusal that does not say who won is not an explanation
- [ ] The rule is printed in the UI next to the queue. A ranking nobody can read is a black box
- [ ] Human attention is the third scarce resource: the approval queue is sorted by the same
      rank, and says why this one is at the top

### T17.3 — Practices, distinct from policies

**Policies** are hard and already exist: hazmat never flies, AEC-Q100 or nothing, MOQ, budget
ceiling, the Rs 1,50,000 gate. `_hard_filter` deletes violators and there is no argument.

**Practices** are defeasible — what a good planner does, which is not the same as what the
rules forbid. Do not spend the last of the emergency budget on a medium-priority order while a
critical one is open. Prefer single-source over a split when the split saves under ~5%. Do not
buy air freight for a shortfall a reschedule covers. Keep the second source warm.

The trap is putting these in a prompt. Then the model "knows" them, nothing is checkable, and
we have argued ourselves into exactly the position we criticise. So: **practices are data.**

```
practices(id, name, condition, effect, weight, source, active)
practice_applications(decision_id, practice_id, outcome, reason)
   -- outcome: 'followed' | 'overridden'
```

- [ ] Practices adjust **score**, never eligibility. A practice that can delete a candidate is
      a policy wearing a costume, and belongs in `_hard_filter` with the others
- [ ] Every practice that fired is recorded as followed or overridden, with the reason
- [ ] The explanation reads: "took the split even though P-04 prefers single-source, because
      the single-source option lands 26h late"
- [ ] Each practice names its **source** — the ops convention it encodes. An unsourced practice
      is an opinion with a table behind it
- [ ] A practice that is never overridden in any scenario is either a policy or decoration

### T17.4 — Incident scope: switching the problem switches the world

Today everything hangs off `_active_run_id` — one run, one world. Multiple simultaneous
problems need a second axis: scope to an **incident** inside the run.

- [ ] Incident scope threaded through the API, not a filter bolted onto each screen
- [ ] One selector at the top of the map. Changing it re-points KPIs, map, recovery, approvals,
      audit and intelligence together
- [ ] "All problems" is a valid scope and shows the triage queue, not zeros
- [ ] The selector shows each incident's rank and severity, so choosing is informed

### T17.5 — Test matrix: from one trap to contention

- [ ] `test_budget_ceiling.py` — two incidents, one budget. Total committed + held **never**
      exceeds `EMERGENCY_BUDGET_INR`. This test fails today; that is the point
- [ ] `test_shared_stock.py` — two incidents, one supplier's last units. Allocated ≤ available,
      and the loser's rejection names the winner
- [ ] `test_triage_order.py` — three incidents opened by one port-closure cascade. Processing
      order matches `rank()`, and the printed rule matches the order actually used
- [ ] `test_external_signals.py` — weather, port closure and carrier events all reach the risk
      detector and can raise severity. Severity must have more than one possible origin
- [ ] `test_practice_conflict.py` — two practices point opposite ways. One is chosen, the
      override is recorded with a reason, and the explanation names both
- [ ] `test_release.py` — reject an approval, assert the claim is released and the budget
      returns. A held claim that survives its decision is the leak in a different costume
- [ ] Scenario `S-CONTEND`: port closure opens three incidents across three orders, one
      supplier can serve two of them, the budget covers one and a half

**Done when:** injecting `S-CONTEND` opens three incidents, the queue shows the rank and the
rule that produced it, the agent works them in that order, the third is refused with a reason
that names which incident took the money, and the total spend cannot exceed the ceiling no
matter how the runs interleave.
