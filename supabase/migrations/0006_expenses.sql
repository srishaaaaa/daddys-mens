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
