-- 0011 — Customer projects + the PayPal money loop.
--
-- PROJECTS: a customer order ("Bharat EV Motors — 700 Smart Controller Units")
-- that groups the production orders it needs. Every screen can be read by
-- project: project → production orders → materials → POs → shipments → money.
--
-- FINANCE: one row per PayPal payment the agent makes for a purchase order,
-- plus an append-only event log. The state machine lives in finance_agent.py;
-- the database only records what PayPal actually said.
--
--   mandate (Vault)  →  funds_held (Orders AUTHORIZE)  →  funds_released (capture + payout)
--                                   ↘ hold_voided (void)          ↘ refunded (refund)
--   above the authority limit: funds_held, but release waits for a human code
--
-- Tenancy follows 0010: org_id defaults from the session, RLS filters on it.

-- ---------------------------------------------------------------- projects --
create table if not exists projects (
    id            text primary key,
    name          text not null,
    customer      text not null,
    customer_city text,
    product       text not null,
    units         integer not null,
    due_at        timestamptz,
    owner         text,
    summary       text,
    created_at    timestamptz not null default now(),
    org_id        text not null default nullif(current_setting('app.org_id', true), '')
                  references organizations(id) on delete cascade
);
alter table production_orders add column if not exists project_id text;
create index if not exists production_orders_project_idx on production_orders (project_id);

-- ----------------------------------------------------- supplier payee emails --
-- Where PayPal Payouts sends a supplier's money. Sandbox accounts in the demo.
alter table suppliers add column if not exists paypal_email text;

-- ----------------------------------------------------------------- mandate --
-- The one human consent the agent spends against (Vault v3 payment token).
create table if not exists finance_mandates (
    org_id        text primary key default nullif(current_setting('app.org_id', true), '')
                  references organizations(id) on delete cascade,
    vault_id      text not null,
    customer_id   text,
    payer_email   text,
    status        text not null default 'active',
    approved_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- payments --
create table if not exists payments (
    id                bigserial primary key,
    po_id             text not null,
    incident_id       text,
    supplier_id       text,
    amount_usd        numeric(12,2) not null,
    amount_inr        numeric(14,2),
    state             text not null default 'not_started' check (state in (
                        'not_started','invoice_received','invoice_mismatch','awaiting_approval',
                        'funds_held','funds_released','hold_voided','refunded','payout_sent','failed')),
    needs_approval    boolean not null default false,
    approved_by       text,
    approved_at       timestamptz,
    paypal_order_id   text,
    authorization_id  text,
    capture_id        text,
    refund_id         text,
    payout_batch_id   text,
    invoice_number    text,
    match             text not null default 'pending' check (match in ('pending','matched','mismatch')),
    kind              text not null default 'purchase' check (kind in ('purchase','fee')),
    archived          boolean not null default false,
    note              text,
    expires_at        timestamptz,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now(),
    org_id            text not null default nullif(current_setting('app.org_id', true), '')
                      references organizations(id) on delete cascade
);
create unique index if not exists payments_live_po_idx on payments (org_id, po_id, kind) where not archived;
create index if not exists payments_auth_idx on payments (authorization_id);
create index if not exists payments_capture_idx on payments (capture_id);

create table if not exists payment_events (
    id          bigserial primary key,
    payment_id  bigint references payments(id) on delete cascade,
    at          timestamptz not null default now(),
    type        text not null,
    detail      text not null,
    api         text,
    paypal_id   text,
    payload     jsonb,
    org_id      text not null default nullif(current_setting('app.org_id', true), '')
                references organizations(id) on delete cascade
);
create index if not exists payment_events_payment_idx on payment_events (payment_id, at);

-- Release approvals above the authority limit (one-time code sent by email).
create table if not exists release_approvals (
    id           bigserial primary key,
    payment_id   bigint not null references payments(id) on delete cascade,
    code_hash    text not null,
    sent_to      text,
    state        text not null default 'pending' check (state in ('pending','approved','rejected','expired')),
    reason       text,
    requested_at timestamptz not null default now(),
    expires_at   timestamptz not null default now() + interval '24 hours',
    decided_at   timestamptz,
    decided_by   text,
    org_id       text not null default nullif(current_setting('app.org_id', true), '')
                 references organizations(id) on delete cascade
);

-- Every PayPal webhook delivery, verified or not. Idempotent on PayPal's event id.
create table if not exists paypal_webhook_events (
    event_id     text primary key,
    event_type   text not null,
    resource_id  text,
    verified     boolean not null default false,
    processed    boolean not null default false,
    payload      jsonb,
    received_at  timestamptz not null default now(),
    org_id       text references organizations(id) on delete cascade
);

-- --------------------------------------------------------------------- RLS --
do $$
declare t text;
begin
  foreach t in array array['projects','finance_mandates','payments','payment_events','release_approvals'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_tenant', t);
    execute format('create policy %I on %I for all using (app_bypass() or org_id = app_current_org()) '
                   'with check (app_bypass() or org_id = app_current_org())', t || '_tenant', t);
    execute format('create index if not exists %I on %I (org_id)', t || '_org_idx', t);
  end loop;
end $$;
-- Webhooks arrive with no tenant; rows are written by the system path only.
alter table paypal_webhook_events enable row level security;
drop policy if exists paypal_webhook_events_tenant on paypal_webhook_events;
create policy paypal_webhook_events_tenant on paypal_webhook_events for all
    using (app_bypass() or org_id = app_current_org())
    with check (app_bypass() or org_id = app_current_org());

-- The app role used by the API (see 0010) needs the same grants as other tables.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'disruptionops_app') then
    grant select, insert, update, delete on projects, finance_mandates, payments, payment_events,
          release_approvals, paypal_webhook_events to disruptionops_app;
    grant usage, select on sequence payments_id_seq, payment_events_id_seq, release_approvals_id_seq
          to disruptionops_app;
  end if;
end $$;

-- ------------------------------------------------------------- demo seed --
-- Projects for the NEXA demo tenant, linked to its production orders.
insert into projects (id, name, customer, customer_city, product, units, due_at, owner, summary, org_id) values
  ('PRJ-2041','SCU-700 · Smart Controller Units','Bharat EV Motors','Chennai','Smart Controller Unit',700, now() + interval '6 days','A. Kulkarni',
   'Controllers for Bharat EV''s Q4 scooter run. MCUs come from Zhen Hua (Shenzhen) on PO-7712.','NEXA'),
  ('PRJ-2042','BMS-380 · Battery Management Systems','Bharat EV Motors','Chennai','Battery Mgmt System',380, now() + interval '9 days','R. Iyer',
   'Certified BMS ICs plus Li-ion cell modules (hazmat: sea or road only).','NEXA'),
  ('PRJ-2043','TCU-500 · Telematics Units','Shakti Auto','Pune','Telematics Unit',500, now() + interval '11 days','A. Kulkarni',
   'LTE modems for Shakti''s fleet telematics.','NEXA'),
  ('PRJ-2044','IC-450 · Instrument Clusters','Shakti Auto','Pune','Instrument Cluster',450, now() + interval '14 days','S. Deshmukh',
   '7-inch automotive displays for the 2027 cluster.','NEXA'),
  ('PRJ-2045','SCU-300 · Smart Controller Units','Shakti Auto','Pune','Smart Controller Unit',300, now() + interval '17 days','S. Deshmukh',
   'Low-priority run the agent may stand down to cover SCU-700.','NEXA')
on conflict (id) do nothing;

update production_orders set project_id = case id
    when 'PROD-882' then 'PRJ-2041' when 'PROD-884' then 'PRJ-2041'
    when 'PROD-883' then 'PRJ-2042' when 'PROD-887' then 'PRJ-2042'
    when 'PROD-885' then 'PRJ-2043' when 'PROD-886' then 'PRJ-2044'
    when 'PROD-888' then 'PRJ-2045' end
 where org_id = 'NEXA' and project_id is null;

-- Sandbox payee accounts for the demo suppliers.
update suppliers set paypal_email = case id
    when 'SUP-21'  then 'dops-sup21-dada@business.example.com'
    when 'SUP-42'  then 'dops-sup42-dada@business.example.com'
    when 'SUP-57'  then 'dops-sup57-dada@business.example.com'
    when 'SUP-71'  then 'dops-sup71-dada@business.example.com'
    when 'SUP-33'  then 'dops-sup33-dada@business.example.com'
    when 'SUP-95'  then 'dops-sup95-dada@business.example.com'
    else 'dops-sup42-dada@business.example.com' end
 where org_id = 'NEXA' and paypal_email is null;
