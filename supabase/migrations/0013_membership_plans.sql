-- Membership plans, fees, expiry and payments; member details on bills. Safe to re-run.
create table if not exists membership_plans (
  id              text primary key default gen_random_uuid()::text,
  name            text not null,
  fee             numeric(12,2) not null default 0 check (fee >= 0),
  validity_months integer not null default 12 check (validity_months between 1 and 120),
  discount_pct    numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  birthday_pct    numeric(5,2) not null default 0 check (birthday_pct between 0 and 100),
  description     text not null default '',
  is_active       boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now()
);
alter table membership_plans enable row level security;

-- Three starter plans (editable in the Membership screen). Only added when there are no plans yet.
insert into membership_plans (name, fee, validity_months, discount_pct, birthday_pct, description, sort_order)
select * from (values
  ('Silver Membership',   199::numeric, 3,  5::numeric,  10::numeric, 'Basic member benefits: member discount on every bill.', 1),
  ('Gold Membership',     499::numeric, 6, 10::numeric,  15::numeric, 'Better discounts and early access to special offers.', 2),
  ('Platinum Membership', 999::numeric, 12, 15::numeric, 20::numeric, 'Premium benefits: the best discount and first pick of new arrivals.', 3)
) as v(name, fee, validity_months, discount_pct, birthday_pct, description, sort_order)
where not exists (select 1 from membership_plans);

alter table memberships add column if not exists plan_id        text;
alter table memberships add column if not exists plan_name      text not null default '';
alter table memberships add column if not exists expires_at     date;
alter table memberships add column if not exists payment_status text not null default 'paid' check (payment_status in ('paid', 'pending'));
alter table memberships add column if not exists birthday       date;

create table if not exists membership_payments (
  id         text primary key default gen_random_uuid()::text,
  member_id  text not null references memberships(id) on delete cascade,
  plan_name  text not null default '',
  amount     numeric(12,2) not null default 0,
  status     text not null default 'paid' check (status in ('paid', 'pending')),
  kind       text not null default 'join' check (kind in ('join', 'renewal')),
  created_at timestamptz not null default now(),
  paid_at    timestamptz
);
create index if not exists idx_membership_payments_member on membership_payments (member_id);
alter table membership_payments enable row level security;

-- Bills remember which member discount was applied.
alter table orders add column if not exists member_no   text;
alter table orders add column if not exists member_plan text;
