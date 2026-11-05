-- 0010 — Organisations: tenancy enforced by Postgres, not by 300 queries.
--
-- Two facts made this cheap.
--
-- `core.db_conn()` is the only place a connection is acquired — 64 call sites
-- across the codebase, zero direct `pool.acquire()` — so a single hook there
-- sets the tenant for every query the application will ever run.
--
-- And Postgres can do both halves of tenancy itself: FILTER rows by the current
-- tenant (row level security) and SUPPLY the tenant on insert (a column default
-- reading the same setting). Between them, not one of the ~300 existing SQL
-- statements has to change. A SELECT that forgets to scope itself is scoped
-- anyway. An INSERT that forgets to set org_id gets the right one. Tenancy you
-- have to remember to write is tenancy you will eventually forget to write, and
-- the failure mode is one customer reading another's supply chain.
--
-- `app.org_bypass` exists for this migration, for the signup path (which must
-- create an org before any org is current), and for support work. It is
-- defence-in-depth against a missing WHERE clause, not against a compromised
-- backend — only our own process can set it.
--
-- Order matters: add the column nullable, backfill, then constrain. A NOT NULL
-- added before the backfill orphans every existing row.

begin;

-- ------------------------------------------------------------------ people ---

create table if not exists users (
    id            text primary key,
    email         text not null unique,
    full_name     text,
    password_hash text,                       -- null until they set one
    is_active     boolean not null default true,
    created_at    timestamptz not null default now(),
    last_seen_at  timestamptz
);

create table if not exists org_members (
    org_id     text not null references organizations(id) on delete cascade,
    user_id    text not null references users(id) on delete cascade,
    -- owner    : billing and member management
    -- approver : may approve spend past the authority line
    -- operator : may run the agent and answer its questions
    -- viewer   : read only
    role       text not null default 'operator'
               check (role in ('owner','approver','operator','viewer')),
    created_at timestamptz not null default now(),
    primary key (org_id, user_id)
);
create index if not exists org_members_user_idx on org_members (user_id);

-- Browser sessions and machine tokens are the same object: a bearer string that
-- resolves to (org, user) and expires. `kind` changes only how it is issued and
-- how long it lives. `subject_id` scopes the two external kinds — a supplier's
-- magic link speaks for exactly one supplier, never for the whole tenant.
create table if not exists auth_tokens (
    token_hash   text primary key,            -- sha256; the token is never stored
    kind         text not null
                 check (kind in ('session','api','supplier','warehouse')),
    org_id       text not null references organizations(id) on delete cascade,
    user_id      text references users(id) on delete cascade,
    subject_id   text,
    label        text,
    created_at   timestamptz not null default now(),
    expires_at   timestamptz,
    revoked_at   timestamptz,
    last_used_at timestamptz
);
create index if not exists auth_tokens_org_idx  on auth_tokens (org_id);
create index if not exists auth_tokens_user_idx on auth_tokens (user_id);

alter table organizations
    add column if not exists created_at timestamptz not null default now(),
    add column if not exists plan       text not null default 'trial',
    add column if not exists is_active  boolean not null default true;

-- --------------------------------------------------------------- the setting --

create or replace function app_current_org() returns text
language sql stable as $$
  select nullif(current_setting('app.org_id', true), '')
$$;

-- `app.org_bypass` is a plain GUC, and any role can set one. On its own that
-- made bypass a one-statement escape from tenancy for anything that could get
-- SQL executed — exactly the class of bug row-level security exists to contain.
-- Verified: the application role, self-granting bypass, could read all 13
-- suppliers across both tenants.
--
-- So bypass additionally requires that the executing role is not the
-- application. `current_user` rather than `session_user`, because the former is
-- the role the statement is actually running as and therefore sees an
-- escalation attempted from inside a session; the latter would not.
--
-- The application never needs bypass now: identity tables carry their own
-- grants below, so signup and login work without it.
create or replace function app_bypass() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.org_bypass', true), '') = 'on'
     and current_user <> 'disruptionops_app'
$$;

-- ------------------------------------------------------------- the app role --
--
-- Created here, before any policy names it. Everything else in this file is
-- decoration unless the application stops connecting as `postgres`: that role
-- carries BYPASSRLS, which means exactly what it says — every policy below is
-- skipped, silently, for every query. Row-level security you cannot see failing
-- is worse than none, because you will believe in it.
--
-- Deployment step, once, out of band (a password does not belong in git):
--
--     alter role disruptionops_app with login password '<strong-secret>';
--
-- then point DATABASE_URL at that role. Until you do, this migration changes
-- nothing about how the running application behaves — deliberately, so it can
-- be applied to a live system and switched on afterwards.

do $approle$
begin
    if not exists (select 1 from pg_roles where rolname = 'disruptionops_app') then
        create role disruptionops_app nologin noinherit;   -- password set later
    end if;
end
$approle$;

-- ------------------------------------------------- the column and the filter --
--
-- One loop rather than 34 hand-written blocks: every tenant table gets exactly
-- the same treatment, and a table added later that is missing from this list is
-- a visible omission rather than a subtly different policy.

do $tenancy$
declare
    t text;
    tenant_tables text[] := array[
        'active_run','agent_constraints','approvals','audit_events',
        'bill_of_materials','components','evaluation_results','goods_receipts',
        'human_input_requests','incidents','inventory','message_threads',
        'messages','product_families','production_orders','products',
        'purchase_orders','quotes','recovery_plans','reliability_events',
        'resource_claims','rfqs','run_scores','scenario_runs',
        'shipment_positions','shipment_tracking','supplier_catalog',
        'supplier_lanes','supplier_memory','supplier_quotes','suppliers',
        'thread_messages','warehouse_tasks','warehouses'];
    -- Wide-open `using (true)` policies inherited from the hackathon build.
    -- They granted anon and authenticated a read of every row in every tenant.
    open_tables text[] := array[
        'approvals','audit_events','components','incidents','inventory',
        'messages','production_orders','purchase_orders','quotes','rfqs',
        'run_scores','scenario_runs','shipment_tracking','supplier_catalog',
        'supplier_lanes','supplier_memory','suppliers','system_config',
        'warehouses'];
begin
    foreach t in array open_tables loop
        execute format('drop policy if exists %I on %I', t || '_read', t);
    end loop;

    foreach t in array tenant_tables loop
        execute format('alter table %I add column if not exists org_id text', t);
        -- Everything that exists today belongs to the first tenant.
        execute format('update %I set org_id = %L where org_id is null', t, 'NEXA');
        execute format(
            'alter table %I alter column org_id set default '
            'nullif(current_setting(''app.org_id'', true), '''')', t);
        execute format('alter table %I alter column org_id set not null', t);
        execute format('alter table %I drop constraint if exists %I', t, t || '_org_fk');
        execute format(
            'alter table %I add constraint %I foreign key (org_id) '
            'references organizations(id) on delete cascade', t, t || '_org_fk');
        execute format('create index if not exists %I on %I (org_id)',
                       t || '_org_idx', t);

        execute format('alter table %I enable row level security', t);
        execute format('alter table %I force row level security', t);
        execute format('drop policy if exists %I on %I', t || '_tenant', t);
        execute format(
            'create policy %I on %I for all '
            'using (app_bypass() or org_id = app_current_org()) '
            'with check (app_bypass() or org_id = app_current_org())',
            t || '_tenant', t);
    end loop;
end
$tenancy$;

-- `organizations` scopes on its own primary key.
alter table organizations enable row level security;
alter table organizations force row level security;
drop policy if exists organizations_tenant on organizations;
create policy organizations_tenant on organizations for all
    using      (app_bypass() or id = app_current_org())
    with check (app_bypass() or id = app_current_org());

-- Identity tables. `users` is reachable only under bypass, because the login
-- path has to read a user before it knows which org that user belongs to.
alter table users        enable row level security;
alter table users        force  row level security;
alter table org_members  enable row level security;
alter table org_members  force  row level security;
alter table auth_tokens  enable row level security;
alter table auth_tokens  force  row level security;

drop policy if exists users_tenant on users;
create policy users_tenant on users for all
    using (app_bypass()) with check (app_bypass());

drop policy if exists org_members_tenant on org_members;
create policy org_members_tenant on org_members for all
    using      (app_bypass() or org_id = app_current_org())
    with check (app_bypass() or org_id = app_current_org());

drop policy if exists auth_tokens_tenant on auth_tokens;
create policy auth_tokens_tenant on auth_tokens for all
    using      (app_bypass() or org_id = app_current_org())
    with check (app_bypass() or org_id = app_current_org());

-- Identity, granted to the application directly rather than through bypass.
-- Login has to find a user before it can know which organisation to scope to,
-- and signup creates an organisation before one is current. These four tables
-- hold no supply-chain data, so the blast radius of an injection here is
-- "can enumerate accounts", not "can read every customer's supplier pricing" —
-- and passwords are PBKDF2 hashes, tokens SHA-256, so neither yields a usable
-- credential.
drop policy if exists users_app on users;
create policy users_app on users for all to disruptionops_app
    using (true) with check (true);
drop policy if exists auth_tokens_app on auth_tokens;
create policy auth_tokens_app on auth_tokens for all to disruptionops_app
    using (true) with check (true);
drop policy if exists org_members_app on org_members;
create policy org_members_app on org_members for all to disruptionops_app
    using (true) with check (true);
drop policy if exists organizations_app on organizations;
create policy organizations_app on organizations for all to disruptionops_app
    using (true) with check (true);

-- system_config stays global: deployment settings, not tenant data. Its
-- wide-open read policy is dropped above; the backend reads it as owner.

-- --------------------------------------------------------------- the grants --
--
-- The application role owns nothing and bypasses nothing. It can read and write
-- every tenant table, and it cannot escape a single policy.

grant usage on schema public to disruptionops_app;
grant select, insert, update, delete
    on all tables in schema public to disruptionops_app;
grant usage, select on all sequences in schema public to disruptionops_app;

-- Tables and sequences created after this migration are covered too, otherwise
-- the next feature silently becomes unreadable to the application.
alter default privileges in schema public
    grant select, insert, update, delete on tables to disruptionops_app;
alter default privileges in schema public
    grant usage, select on sequences to disruptionops_app;

-- `audit_events` stays append-only for the application, as it always has been.
-- The whole compliance argument rests on the log being unable to change after
-- the fact, and a role that can UPDATE it is a role that can rewrite history.
revoke update, delete on audit_events from disruptionops_app;

commit;
