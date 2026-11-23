-- Coupon audience, split payments, product photos. Safe to re-run.
alter table coupons  add column if not exists audience   text not null default 'all' check (audience in ('all','regular','loyalty'));

alter table orders   add column if not exists split_cash numeric not null default 0;
alter table orders   add column if not exists split_upi  numeric not null default 0;
alter table orders   add column if not exists split_card numeric not null default 0;

alter table products add column if not exists image_url  text;
