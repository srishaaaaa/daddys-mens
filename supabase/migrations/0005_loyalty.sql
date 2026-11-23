-- Loyalty programme: settings, members, points ledger, gifts/rewards/offers, vouchers, WhatsApp messages.
-- Safe to re-run.

create table if not exists loyalty_settings (
  id         text primary key default 'default',
  config     jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists loyalty_customers (
  id          text primary key default gen_random_uuid()::text,
  code        text not null unique,
  phone       text not null unique,            -- 10-digit mobile, same key bills use
  name        text not null default '',
  email       text not null default '',
  birthday    text not null default '',
  anniversary text not null default '',
  status      text not null default 'active' check (status in ('active','inactive')),
  consent     boolean not null default false,  -- agreed to WhatsApp messages
  whatsapp    text not null default '',
  available   integer not null default 0 check (available >= 0),
  lifetime    integer not null default 0,
  redeemed    integer not null default 0,
  expired     integer not null default 0,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists loyalty_ledger (
  id             bigserial primary key,
  customer_id    text not null references loyalty_customers(id) on delete cascade,
  type           text not null,   -- purchase | redemption | adjustment | reward | refund_reversal | expiry ...
  points         integer not null, -- signed
  balance_before integer not null,
  balance_after  integer not null,
  order_id       text,
  description    text not null default '',
  actor          text not null default '',
  created_at     timestamptz not null default now()
);
create index if not exists idx_loyalty_ledger_customer on loyalty_ledger(customer_id, created_at desc);
create index if not exists idx_loyalty_ledger_created  on loyalty_ledger(created_at desc);

-- Gifts customers unlock with points, spending rewards (one JSON document each, see lib/loyalty/types.ts)
create table if not exists loyalty_rewards (
  id         text primary key default gen_random_uuid()::text,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
-- Offers on the bill (for everyone)
create table if not exists loyalty_offers (
  id         text primary key default gen_random_uuid()::text,
  data       jsonb not null,
  created_at timestamptz not null default now()
);
-- Rewards a customer has earned (unlocked, claimed, cancelled, expired)
create table if not exists loyalty_vouchers (
  id          text primary key default gen_random_uuid()::text,
  customer_id text not null references loyalty_customers(id) on delete cascade,
  reward_id   text,
  status      text not null default 'issued',
  data        jsonb not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_loyalty_vouchers_customer on loyalty_vouchers(customer_id, status);

-- WhatsApp messages prepared for members (nothing is sent automatically)
create table if not exists loyalty_messages (
  id          text primary key default gen_random_uuid()::text,
  customer_id text not null references loyalty_customers(id) on delete cascade,
  type        text not null,
  phone       text not null,
  text        text not null,
  status      text not null default 'pending' check (status in ('pending','opened','failed')),
  error       text not null default '',
  order_id    text,
  created_at  timestamptz not null default now(),
  opened_at   timestamptz,
  opens       integer not null default 0
);
create index if not exists idx_loyalty_messages_created on loyalty_messages(created_at desc);

create table if not exists loyalty_audit (
  id          bigserial primary key,
  actor       text not null default '',
  action      text not null,
  customer_id text,
  reason      text not null default '',
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

alter table orders add column if not exists loyalty_customer_id text;
alter table orders add column if not exists loyalty_prev        integer;
alter table orders add column if not exists loyalty_earned      integer not null default 0;
alter table orders add column if not exists loyalty_used        integer not null default 0;
alter table orders add column if not exists loyalty_balance     integer;
alter table orders add column if not exists loyalty_discount    numeric not null default 0;

alter table loyalty_settings  enable row level security;
alter table loyalty_customers enable row level security;
alter table loyalty_ledger    enable row level security;
alter table loyalty_rewards   enable row level security;
alter table loyalty_offers    enable row level security;
alter table loyalty_vouchers  enable row level security;
alter table loyalty_messages  enable row level security;
alter table loyalty_audit     enable row level security;

-- Atomic points change: locks the member, never lets the balance go below zero, writes the ledger row.
create or replace function loyalty_apply(
  p_customer text, p_type text, p_points integer, p_order text, p_desc text, p_actor text
) returns integer
language plpgsql
as $$
declare
  c loyalty_customers%rowtype;
  after_bal integer;
begin
  select * into c from loyalty_customers where id = p_customer for update;
  if not found then raise exception 'Customer not found'; end if;
  after_bal := c.available + p_points;
  if after_bal < 0 then raise exception 'Not enough points (% available)', c.available; end if;
  update loyalty_customers set
    available  = after_bal,
    lifetime   = lifetime + greatest(p_points, 0),
    redeemed   = redeemed + greatest(-p_points, 0) * (case when p_type = 'redemption' then 1 else 0 end),
    updated_at = now()
  where id = p_customer;
  insert into loyalty_ledger (customer_id, type, points, balance_before, balance_after, order_id, description, actor)
  values (p_customer, p_type, p_points, c.available, after_bal, p_order, coalesce(p_desc, ''), coalesce(p_actor, ''));
  return after_bal;
end;
$$;
