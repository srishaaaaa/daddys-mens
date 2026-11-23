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
