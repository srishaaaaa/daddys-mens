-- ===== 0002_inventory.sql =====
-- Inventory: categories, stock tracking on products, and a stock-movement ledger.
-- Safe to re-run.

create table if not exists categories (
  id         text primary key default gen_random_uuid()::text,
  name       text not null unique,
  created_at timestamptz not null default now()
);

alter table products add column if not exists category           text not null default 'General';
alter table products add column if not exists item_type          text not null default 'PRODUCT';
alter table products add column if not exists cost_price         numeric(12,2) not null default 0;
alter table products add column if not exists current_stock      numeric;          -- null for services
alter table products add column if not exists low_stock_alert    numeric;          -- null for services
alter table products add column if not exists offer_discount_pct numeric not null default 0;
alter table products add column if not exists offer_price        numeric;
alter table products add column if not exists is_active          boolean not null default true;

do $$ begin
  alter table products add constraint products_item_type_check check (item_type in ('PRODUCT','SERVICE'));
exception when duplicate_object then null; end $$;

create table if not exists stock_movements (
  id           bigserial primary key,
  product_id   text references products(id) on delete set null,
  product_name text not null,
  movement_type text not null check (movement_type in ('OPENING','RESTOCK','RETURN','LOSS','RECONCILE','SALE','EDIT')),
  quantity     numeric not null,         -- signed: + in / - out
  stock_before numeric not null,
  stock_after  numeric not null,
  note         text not null default '',
  reference    text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists idx_stock_movements_created on stock_movements(created_at desc);
create index if not exists idx_stock_movements_product on stock_movements(product_id);

alter table categories      enable row level security;
alter table stock_movements enable row level security;

-- Deduct stock for a new bill. Items are matched to products by name (case-insensitive).
create or replace function record_sale_stock(p_order_id text, p_items jsonb)
returns void
language plpgsql
as $$
declare
  item jsonb;
  prod products%rowtype;
  qty numeric;
  after_qty numeric;
begin
  for item in select * from jsonb_array_elements(p_items) loop
    qty := coalesce((item->>'quantity')::numeric, 0);
    continue when qty <= 0;
    select * into prod from products
      where lower(name) = lower(item->>'snapshot_name')
        and item_type = 'PRODUCT' and current_stock is not null
      limit 1 for update;
    continue when not found;
    after_qty := greatest(prod.current_stock - qty, 0);
    continue when after_qty = prod.current_stock;  -- nothing to log
    update products set current_stock = after_qty, updated_at = now() where id = prod.id;
    insert into stock_movements (product_id, product_name, movement_type, quantity, stock_before, stock_after, note, reference)
    values (prod.id, prod.name, 'SALE', after_qty - prod.current_stock, prod.current_stock, after_qty, 'Sold via billing', p_order_id);
  end loop;
end;
$$;

-- ===== 0003_coupons.sql =====
-- Coupon management. Safe to re-run.
create table if not exists coupons (
  id          text primary key default gen_random_uuid()::text,
  code        text not null unique,
  percent     numeric not null check (percent > 0 and percent <= 100),
  min_order   numeric not null default 0,
  expires_at  date,
  usage_limit integer,                      -- null = unlimited
  used        integer not null default 0,
  active      boolean not null default true,
  restricted  boolean not null default false,       -- only works for phones it was sent to
  phones      jsonb not null default '[]'::jsonb,   -- 10-digit numbers it was sent to
  sent        integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table coupons enable row level security;  -- server (secret key) only

-- Counts one use, refusing if the coupon is paused, expired or used up.
create or replace function redeem_coupon(p_code text)
returns boolean
language plpgsql
as $$
declare n int;
begin
  update coupons set used = used + 1
   where code = upper(p_code) and active
     and (expires_at is null or expires_at >= current_date)
     and (usage_limit is null or used < usage_limit);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;

-- ===== 0004_upi_channel.sql =====
-- How a UPI payment reached the shop (counter_qr, whatsapp_link, guest_phone, gpay_number, other).
-- Safe to re-run.
alter table orders add column if not exists upi_channel text;

-- ===== 0005_loyalty.sql =====
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

-- ===== 0006_expenses.sql =====
-- Expense tracker. Safe to re-run.
create table if not exists expense_categories (
  id         text primary key default gen_random_uuid()::text,
  name       text not null,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists idx_expense_categories_name on expense_categories (lower(name));

insert into expense_categories (name)
select unnest(array[
  'Stock Purchase', 'Rent', 'Salaries', 'Utilities', 'Electricity', 'Transport',
  'Marketing', 'Repairs & Maintenance', 'Taxes & Fees', 'Miscellaneous'
]) on conflict do nothing;

create table if not exists expenses (
  id           text primary key default gen_random_uuid()::text,
  title        text not null,
  category     text not null default 'General',
  amount       numeric(12,2) not null check (amount > 0),
  payment_mode text not null default 'CASH',   -- CASH | UPI | CARD | BANK | OTHER
  notes        text,
  expense_date date not null default current_date,
  created_at   timestamptz not null default now()
);
create index if not exists idx_expenses_date on expenses (expense_date desc);

alter table expense_categories enable row level security;
alter table expenses           enable row level security;

-- ===== 0007_shop_settings.sql =====
-- Shop settings edited from the app's Settings screen (UPI details, public website address).
-- Safe to re-run.
create table if not exists shop_settings (
  id             text primary key default 'default',
  upi_id         text not null default '',
  upi_name       text not null default '',
  upi_phone      text not null default '',
  upi_qr_minutes integer not null default 5,
  public_url     text not null default '',
  updated_at     timestamptz not null default now()
);
alter table shop_settings enable row level security;
insert into shop_settings (id) values ('default') on conflict do nothing;

-- ===== 0008_leftovers.sql =====
-- Coupon audience, split payments, product photos. Safe to re-run.
alter table coupons  add column if not exists audience   text not null default 'all' check (audience in ('all','regular','loyalty'));

alter table orders   add column if not exists split_cash numeric not null default 0;
alter table orders   add column if not exists split_upi  numeric not null default 0;
alter table orders   add column if not exists split_card numeric not null default 0;

alter table products add column if not exists image_url  text;

