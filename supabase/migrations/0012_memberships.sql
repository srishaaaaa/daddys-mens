-- Membership: a simple, free membership list (separate from loyalty). Safe to re-run.
create sequence if not exists membership_seq start 1;
create table if not exists memberships (
  id         text primary key default gen_random_uuid()::text,
  member_no  text not null unique default ('DH-' || lpad(nextval('membership_seq')::text, 5, '0')),
  name       text not null,
  phone      text not null,
  status     text not null default 'active' check (status in ('active', 'inactive')),
  joined_at  timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create unique index if not exists idx_memberships_phone on memberships (phone);
alter table memberships enable row level security;
