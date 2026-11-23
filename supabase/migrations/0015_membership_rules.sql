-- Membership: product/category restrictions, an extra offer percentage, refunds on bills, and a setting for whether the
-- bill being made counts toward total-purchases eligibility. Safe to re-run.
alter table membership_plans add column if not exists only_categories text[] not null default '{}';
alter table membership_plans add column if not exists only_products   text[] not null default '{}';
alter table membership_plans add column if not exists offer_pct       numeric(5,2) not null default 0 check (offer_pct between 0 and 100);
alter table membership_settings add column if not exists count_current_bill boolean not null default true;

alter table orders add column if not exists member_offer_amount numeric not null default 0;
alter table orders add column if not exists refund_amount       numeric not null default 0;
alter table orders add column if not exists refunded_at         timestamptz;
alter table orders add column if not exists refund_note         text;
