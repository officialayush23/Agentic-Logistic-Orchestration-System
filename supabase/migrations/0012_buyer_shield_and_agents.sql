-- 0012 · Buyer Shield guards + multi-agent memory
--
-- Seven deterministic guards stand between the agents and the money. Every
-- guard decision (pass or block) is a row in guard_events, which is what the
-- "money protected" numbers are summed from.
--
-- The LangGraph checkpointer and long-term memory store live in their own
-- schema, `langgraph`, which PostgREST does not expose: agent state is never
-- reachable through the Supabase public API.

create schema if not exists langgraph;

-- ------------------------------------------------------- purchase orders --
alter table purchase_orders
    add column if not exists project_id       text,
    add column if not exists ld_pct_per_week  numeric(5,2) not null default 5.0,
    add column if not exists ld_cap_pct       numeric(5,2) not null default 10.0,
    add column if not exists retention_pct    numeric(5,2) not null default 0,
    add column if not exists discount_pct     numeric(5,2),
    add column if not exists discount_days    int,
    add column if not exists net_days         int not null default 30,
    add column if not exists promised_date    timestamptz,
    add column if not exists revised_date     timestamptz,
    add column if not exists acknowledged_at  timestamptz,
    add column if not exists invoice_number   text,
    add column if not exists cancelled        boolean not null default false;

-- --------------------------------------------------------------- suppliers --
alter table suppliers
    add column if not exists paypal_email_verified text,
    add column if not exists payee_locked_at       timestamptz,
    add column if not exists health_score          int,
    add column if not exists health_signals        jsonb not null default '[]'::jsonb;

-- payments: blocked by a guard, and a retention tranche held after capture
alter table payments drop constraint if exists payments_state_check;
alter table payments add constraint payments_state_check check (state in (
    'not_started','invoice_received','invoice_mismatch','awaiting_approval','blocked',
    'funds_held','funds_released','retention_held','hold_voided','refunded','payout_sent','failed'));
alter table payments
    add column if not exists captured_usd   numeric(12,2),
    add column if not exists credit_usd     numeric(12,2),
    add column if not exists retention_usd  numeric(12,2),
    add column if not exists retention_until timestamptz,
    add column if not exists reauthorized_at timestamptz;

-- ---------------------------------------------------------------- new tables --
create table if not exists bom_lines (
    id                  bigserial primary key,
    org_id              text not null default nullif(current_setting('app.org_id', true), '')
                        references organizations(id) on delete cascade,
    project_id          text not null,
    component_id        text not null,
    qty                 int not null check (qty > 0),
    need_by             timestamptz not null,
    lead_time_days      int not null default 14,
    transit_days        int not null default 5,
    buffer_days         int not null default 3,
    approved_alternates jsonb not null default '[]'::jsonb,
    suggested_alternates jsonb not null default '[]'::jsonb,
    eol_date            date,
    ltb_date            date,
    ordered_po_id       text,
    unique (project_id, component_id)
);

create table if not exists budget_envelopes (
    id            bigserial primary key,
    org_id        text not null default nullif(current_setting('app.org_id', true), '')
                  references organizations(id) on delete cascade,
    project_id    text not null,
    category      text,                       -- null = whole project
    window_start  date not null,
    window_end    date not null,
    cap_usd       numeric(12,2) not null check (cap_usd > 0)
);

create table if not exists price_benchmarks (
    component_id     text primary key,
    org_id           text not null default nullif(current_setting('app.org_id', true), '')
                     references organizations(id) on delete cascade,
    should_cost_inr  numeric(12,2) not null,
    last_paid_inr    numeric(12,2),
    index_name       text,
    index_base       numeric(12,4),
    index_now        numeric(12,4),
    deadband_pct     numeric(5,2) not null default 3
);

create table if not exists payee_change_requests (
    id             bigserial primary key,
    org_id         text not null default nullif(current_setting('app.org_id', true), '')
                   references organizations(id) on delete cascade,
    supplier_id    text not null,
    new_email      text not null,
    requested_via  text not null default 'email',
    sender         text,
    cooling_until  timestamptz not null default now() + interval '72 hours',
    status         text not null default 'pending' check (status in ('pending','approved','rejected')),
    created_at     timestamptz not null default now()
);

create table if not exists supplier_subtiers (
    id             bigserial primary key,
    org_id         text not null default nullif(current_setting('app.org_id', true), '')
                   references organizations(id) on delete cascade,
    supplier_id    text not null,
    subtier_name   text not null,
    city           text,
    lat            double precision,
    lon            double precision,
    part_category  text
);

create table if not exists guard_events (
    id           bigserial primary key,
    org_id       text not null default nullif(current_setting('app.org_id', true), '')
                 references organizations(id) on delete cascade,
    guard        text not null check (guard in (
                   'fair_price','budget','payee_lock','duplicate','pay_on_proof',
                   'late_credit','quality_holdback','hold_expiry','early_pay','buy_timer')),
    outcome      text not null check (outcome in ('pass','block','adjust','escalate')),
    po_id        text,
    supplier_id  text,
    incident_id  text,
    amount_usd   numeric(12,2) not null default 0,    -- money protected / saved by this decision
    reason       text not null,
    detail       jsonb not null default '{}'::jsonb,
    agent        text,                                -- which agent asked
    created_at   timestamptz not null default now()
);
create index if not exists guard_events_po_idx on guard_events (po_id);

-- --------------------------------------------------------------------- RLS --
do $$
declare t text;
begin
  foreach t in array array['bom_lines','budget_envelopes','price_benchmarks',
                           'payee_change_requests','supplier_subtiers','guard_events'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_tenant', t);
    execute format('create policy %I on %I for all using (app_bypass() or org_id = app_current_org()) '
                   'with check (app_bypass() or org_id = app_current_org())', t || '_tenant', t);
    execute format('create index if not exists %I on %I (org_id)', t || '_org_idx', t);
  end loop;
  if exists (select 1 from pg_roles where rolname = 'disruptionops_app') then
    grant select, insert, update, delete on bom_lines, budget_envelopes, price_benchmarks,
          payee_change_requests, supplier_subtiers, guard_events to disruptionops_app;
    grant usage, select on all sequences in schema public to disruptionops_app;
    grant usage, create on schema langgraph to disruptionops_app;
  end if;
end $$;
