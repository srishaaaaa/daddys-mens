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
