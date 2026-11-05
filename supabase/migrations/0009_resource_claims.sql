-- 0009 — Resource claims: make the emergency budget an actual ceiling.
--
-- The bug this closes
-- -------------------
-- `agent._RUNNING` holds one asyncio task per incident, so two incidents plan
-- concurrently. The budget filter read only what had already been *placed*:
--
--     spent      = sum(total_value) from purchase_orders where created_by_agent
--     budget_left = EMERGENCY_BUDGET_INR - spent
--
-- Nothing held money between choosing an option and committing it. Two live
-- incidents each read the same Rs 5,00,000, each approved Rs 4,00,000, and both
-- passed OVER_BUDGET. The authority boundary we present on stage as hard was
-- not one. The same hole existed in units: `supplier_catalog.available_quantity`
-- was read raw, so two incidents could allocate the same 800 units.
--
-- The fix is to reserve rather than merely read. A chosen option holds its
-- budget and its units the moment it is chosen — not when the PO is placed,
-- because "waiting for a human to approve" is exactly the window the leak lived
-- in.
--
--     budget_left = EMERGENCY_BUDGET - placed - held
--
-- Additive only. No existing column changes, no data is rewritten, and a
-- deployment that never inserts a claim behaves exactly as it does today.

create table if not exists resource_claims (
    id              bigserial primary key,
    incident_id     text        not null,
    scenario_run_id bigint,

    -- 'budget' is rupees against EMERGENCY_BUDGET_INR; 'units' is quantity
    -- against one supplier's available_quantity.
    kind            text        not null check (kind in ('budget', 'units')),
    supplier_id     text,                       -- null for budget claims
    component_id    text,                       -- null for budget claims
    amount          numeric     not null check (amount >= 0),

    -- held   → reserved, not yet spent. Counts against the ceiling.
    -- placed → the purchase order exists. Still counts, now via the PO too, so
    --          `placed` claims are excluded from the held sum to avoid
    --          double-counting the same rupee.
    -- released → given back, with a reason. A silent release is a leak in a
    --          different costume, so `reason` is required to leave 'held'.
    state           text        not null default 'held'
                    check (state in ('held', 'placed', 'released')),

    reason          text        not null,
    released_reason text,
    created_at      timestamptz not null default now(),
    released_at     timestamptz,

    -- A claim that left 'held' must say why it left.
    constraint resource_claims_release_needs_reason
        check (state <> 'released' or released_reason is not null)
);

-- The two reads on the hot path: "how much is held right now" and "how many of
-- this supplier's units are spoken for".
create index if not exists resource_claims_open_idx
    on resource_claims (kind, state) where state = 'held';
create index if not exists resource_claims_supplier_idx
    on resource_claims (supplier_id, component_id, state) where state = 'held';
create index if not exists resource_claims_incident_idx
    on resource_claims (incident_id);

comment on table resource_claims is
    'Budget and supplier units reserved by an in-flight incident. Held from the '
    'moment an option is chosen until the order is placed, rejected or expires. '
    'Without this the emergency budget is not a ceiling under concurrency.';
