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
