-- 0013 · Supplier chargebacks (PayPal Invoicing v2) are a guard outcome too.
alter table guard_events drop constraint if exists guard_events_guard_check;
alter table guard_events add constraint guard_events_guard_check check (guard in (
  'fair_price','budget','payee_lock','duplicate','pay_on_proof','late_credit',
  'quality_holdback','hold_expiry','early_pay','buy_timer','chargeback'));
