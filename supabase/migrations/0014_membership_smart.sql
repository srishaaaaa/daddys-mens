-- Smart membership: eligibility rules on plans, how a member joined, settings, WhatsApp message queue, and
-- membership details on bills. Safe to re-run.

alter table membership_plans add column if not exists eligibility text not null default 'manual';
alter table membership_plans drop constraint if exists membership_plans_eligibility_check;
alter table membership_plans add constraint membership_plans_eligibility_check check (eligibility in ('manual', 'single_bill', 'cumulative'));
alter table membership_plans add column if not exists threshold       numeric(12,2) not null default 0 check (threshold >= 0);
alter table membership_plans add column if not exists min_bill        numeric(12,2) not null default 0 check (min_bill >= 0);
alter table membership_plans add column if not exists offer_text      text not null default '';
alter table membership_plans add column if not exists offer_valid_until date;

alter table memberships add column if not exists source text not null default 'manual';
alter table memberships drop constraint if exists memberships_source_check;
alter table memberships add constraint memberships_source_check check (source in ('manual', 'single_bill', 'cumulative'));

alter table membership_payments add column if not exists from_plan text not null default '';
alter table membership_payments add column if not exists source    text not null default 'manual';
alter table membership_payments drop constraint if exists membership_payments_kind_check;
alter table membership_payments add constraint membership_payments_kind_check check (kind in ('join', 'renewal', 'upgrade'));

create table if not exists membership_settings (
  id                text primary key default 'default',
  eligibility_basis text not null default 'net' check (eligibility_basis in ('net', 'subtotal')),
  msg_activation    boolean not null default true,
  msg_upgrade       boolean not null default true,
  msg_renewal       boolean not null default true,
  msg_expiry        boolean not null default true,
  msg_eligibility   boolean not null default true,
  msg_offers        boolean not null default true,
  reminder_days     text not null default '7,3,0',
  updated_at        timestamptz not null default now()
);
insert into membership_settings (id) values ('default') on conflict do nothing;
alter table membership_settings enable row level security;

-- WhatsApp messages the shop sends with one tap (the app opens the chat; there is no sending API).
create table if not exists membership_messages (
  id           text primary key default gen_random_uuid()::text,
  member_id    text references memberships(id) on delete set null,
  phone        text not null,
  name         text not null default '',
  kind         text not null check (kind in ('activation', 'upgrade', 'renewal', 'expiry', 'eligibility', 'offer')),
  text         text not null,
  status       text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  reminder_key text unique,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index if not exists idx_membership_messages_status on membership_messages (status, created_at desc);
alter table membership_messages enable row level security;

-- Bills: the fee charged, and what happened to the membership on that bill.
alter table orders add column if not exists membership_fee numeric not null default 0;
alter table orders add column if not exists member_event    text;
alter table orders add column if not exists member_event_no text;
alter table orders add column if not exists member_offer    text;
