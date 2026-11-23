-- Billing defaults: the bill type and GST settings every new bill starts with. Safe to re-run.
alter table shop_settings add column if not exists default_gst           boolean not null default false;
alter table shop_settings add column if not exists default_gst_rate      numeric not null default 5;
alter table shop_settings add column if not exists default_gst_inclusive boolean not null default false;
