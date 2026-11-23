-- Shop details (invoices, coupons, payment links, WhatsApp) and passcodes. Safe to re-run.
-- Defaults are the values the app used before they were editable.
alter table shop_settings add column if not exists shop_name    text not null default 'Daddy''s Home';
alter table shop_settings add column if not exists shop_tagline text not null default 'Premium Menswear & Accessories';
alter table shop_settings add column if not exists shop_phone   text not null default '8056642706';
alter table shop_settings add column if not exists shop_email   text not null default 'divyadarshan409@gmail.com';
alter table shop_settings add column if not exists shop_address text not null default 'East 2nd Street, Near Bombay Bhavan, 1st Floor, Pudukkottai - 622001.';

-- Passcodes changed from the Settings screen (stored as salted hashes). Null = use ADMIN_PASSCODE / STAFF_PASSCODE from .env.
alter table shop_settings add column if not exists admin_pass_hash text;
alter table shop_settings add column if not exists staff_pass_hash text;
