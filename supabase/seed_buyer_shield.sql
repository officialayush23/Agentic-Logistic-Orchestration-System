-- ============================================================================
-- Buyer Shield demo configuration (idempotent; re-run after every world reset)
--
-- Config only: projects ↔ orders, payees, price benchmarks, budget envelopes,
-- buy timers, PO terms, sub-tier suppliers. No money and no guard decisions are
-- seeded: those are produced live by the agents against PayPal sandbox
-- (scripts/demo_shield.py drives them).
-- ============================================================================

-- tenant for rows written by the system path
select set_config('app.org_id', coalesce(nullif(current_setting('app.org_id', true), ''), 'NEXA'), false);

-- ---- projects ↔ production orders / purchase orders --------------------------
update production_orders set project_id = case id
    when 'PROD-882' then 'PRJ-2041' when 'PROD-884' then 'PRJ-2041'
    when 'PROD-883' then 'PRJ-2042' when 'PROD-887' then 'PRJ-2042'
    when 'PROD-885' then 'PRJ-2043' when 'PROD-886' then 'PRJ-2044'
    when 'PROD-888' then 'PRJ-2045' end
 where project_id is null and id in ('PROD-882','PROD-883','PROD-884','PROD-885','PROD-886','PROD-887','PROD-888');

update purchase_orders set
    project_id    = case id when 'PO-7712' then 'PRJ-2041' when 'PO-7718' then 'PRJ-2042'
                            when 'PO-7725' then 'PRJ-2041' end,
    promised_date = case id when 'PO-7718' then now() - interval '6 days' else coalesce(promised_date, expected_delivery) end,
    invoice_number = case id when 'PO-7712' then 'ZH-INV-55120' when 'PO-7718' then 'KES-2209'
                             when 'PO-7725' then 'CC-7725' end,
    retention_pct = case id when 'PO-7718' then 10 else retention_pct end,
    discount_pct  = case id when 'PO-7725' then 2  else discount_pct end,
    discount_days = case id when 'PO-7725' then 10 else discount_days end,
    acknowledged_at = case id when 'PO-7725' then null else coalesce(acknowledged_at, created_at) end
 where id in ('PO-7712','PO-7718','PO-7725');

-- ---- payees (sandbox) and the payee lock -------------------------------------
update suppliers set paypal_email = case id
    when 'SUP-21'  then 'dops-sup21-dada@business.example.com'
    when 'SUP-42'  then 'dops-sup42-dada@business.example.com'
    when 'SUP-57'  then 'dops-sup57-dada@business.example.com'
    when 'SUP-71'  then 'dops-sup71-dada@business.example.com'
    when 'SUP-33'  then 'dops-sup33-dada@business.example.com'
    when 'SUP-95'  then 'dops-sup95-dada@business.example.com'
    else 'dops-sup42-dada@business.example.com' end
 where paypal_email is null;
update suppliers set paypal_email_verified = paypal_email, payee_locked_at = coalesce(payee_locked_at, now())
 where paypal_email_verified is null;
delete from payee_change_requests where status = 'pending';
-- a reset starts a fresh demo ledger (agent long-term memory is kept on purpose)
delete from guard_events;

-- ---- should-cost benchmarks (INR, same unit as purchase_orders.unit_price) ---
insert into price_benchmarks (component_id, should_cost_inr, last_paid_inr, index_name, index_base, index_now, deadband_pct) values
  ('COMP-104', 112.00, 118.00, null, null, null, 3),
  ('COMP-207', 860.00, 902.00, null, null, null, 3),
  ('COMP-311',  60.00,  64.00, 'LME copper (USD/t)', 9850, 9260, 3),   -- copper fell 6%: de-escalation due
  ('COMP-402', 330.00, 340.00, null, null, null, 3),
  ('COMP-118',  21.00,  22.00, null, null, null, 3),
  ('COMP-520', 395.00, 410.00, null, null, null, 3)
on conflict (component_id) do update set
  should_cost_inr = excluded.should_cost_inr, last_paid_inr = excluded.last_paid_inr,
  index_name = excluded.index_name, index_base = excluded.index_base, index_now = excluded.index_now;

-- ---- project budget envelopes (USD) ------------------------------------------
delete from budget_envelopes where project_id in ('PRJ-2041','PRJ-2042','PRJ-2043','PRJ-2044','PRJ-2045');
insert into budget_envelopes (project_id, category, window_start, window_end, cap_usd) values
  ('PRJ-2041', null, current_date - 7, current_date + 90, 48000),
  ('PRJ-2042', null, current_date - 7, current_date + 90, 60000),
  ('PRJ-2043', null, current_date - 7, current_date + 90, 30000),
  ('PRJ-2044', null, current_date - 7, current_date + 90, 25000),
  ('PRJ-2045', null, current_date - 7, current_date + 90, 12000);

-- ---- buy timers: one BOM line per project part --------------------------------
-- order_by = need_by - lead - transit - buffer. Lead times are the suppliers'
-- quoted ones; a few land inside 48 h so the Sentinel has red timers to act on.
delete from bom_lines where project_id in ('PRJ-2041','PRJ-2042','PRJ-2043','PRJ-2044','PRJ-2045');
insert into bom_lines (project_id, component_id, qty, need_by, lead_time_days, transit_days, buffer_days,
                       approved_alternates, suggested_alternates, eol_date, ltb_date)
select o.project_id, o.required_component, o.units_planned * o.component_per_unit,
       o.deadline - interval '1 day',
       case o.required_component when 'COMP-402' then 7 when 'COMP-520' then 6 when 'COMP-104' then 2
                                 when 'COMP-118' then 1 when 'COMP-207' then 3 else 4 end,
       case o.required_component when 'COMP-402' then 2 when 'COMP-520' then 4 else 1 end,
       1,
       case o.required_component
            when 'COMP-104' then '[{"supplier_id":"SUP-57","part":"FP-MD104-A","approved_by":"R. Iyer"}]'::jsonb
            when 'COMP-118' then '[{"supplier_id":"SUP-77","part":"SHW-CN18","approved_by":"A. Kulkarni"}]'::jsonb
            else '[]'::jsonb end,
       case o.required_component
            when 'COMP-402' then '[{"supplier_id":"SUP-95","part":"NX-MCU-402B","note":"pin-compatible, needs engineer sign-off"}]'::jsonb
            else '[]'::jsonb end,
       case o.required_component when 'COMP-520' then current_date + 75 end,
       case o.required_component when 'COMP-520' then current_date + 20 end
  from (select distinct on (project_id, required_component) * from production_orders
         where project_id is not null order by project_id, required_component, deadline) o
on conflict (project_id, component_id) do nothing;
update bom_lines b set ordered_po_id = p.id
  from purchase_orders p where p.project_id = b.project_id and p.component_id = b.component_id
   and b.ordered_po_id is null;

-- ---- sub-tier: two "independent" connector sources share one plating house ----
delete from supplier_subtiers where subtier_name in ('Penang Plating Works','Hsinchu Wafer Fab 3','Ningbo Copper Rod Co');
insert into supplier_subtiers (supplier_id, subtier_name, city, lat, lon, part_category) values
  ('SUP-103', 'Penang Plating Works', 'Penang',  5.4141, 100.3288, 'connector plating'),
  ('SUP-77',  'Penang Plating Works', 'Penang',  5.4141, 100.3288, 'connector plating'),
  ('SUP-21',  'Hsinchu Wafer Fab 3',  'Hsinchu', 24.8138, 120.9675, 'motor-driver wafers'),
  ('SUP-77',  'Ningbo Copper Rod Co', 'Ningbo',  29.8683, 121.5440, 'copper wire');

-- ---- supplier health signals (seeded: real feeds are paid APIs) -------------
update suppliers set health_score = case id
    when 'SUP-21' then 41 when 'SUP-18' then 38 when 'SUP-29' then 44 when 'SUP-57' then 93
    when 'SUP-42' then 82 when 'SUP-103' then 71 else 78 end,
  health_signals = case id
    when 'SUP-21' then '[{"kind":"claims","note":"carrier contradicted dispatch claims"}]'::jsonb
    when 'SUP-103' then '[{"kind":"subtier","note":"shares plating house with SUP-77"}]'::jsonb
    else '[]'::jsonb end;
