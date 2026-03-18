create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'statement_type'
  ) then
    create type statement_type as enum ('income', 'balance_sheet');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'normalized_category'
  ) then
    create type normalized_category as enum (
      'Revenue',
      'COGS',
      'Operating Expenses',
      'Assets',
      'Liabilities',
      'Equity'
    );
  end if;
end
$$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  base_currency text not null default 'USD',
  created_at timestamptz not null default now()
);

create table if not exists public.reporting_periods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text not null,
  period_date date not null,
  created_at timestamptz not null default now(),
  unique (company_id, period_date)
);

create table if not exists public.financial_entries (
  id uuid primary key default gen_random_uuid(),
  account_name text not null,
  statement_type statement_type not null,
  amount numeric(14, 2) not null,
  period_id uuid not null references public.reporting_periods(id) on delete cascade,
  category normalized_category not null,
  addback_flag boolean not null default false,
  matched_by text,
  confidence text,
  mapping_explanation text,
  created_at timestamptz not null default now()
);

alter table public.financial_entries
  add column if not exists matched_by text;

alter table public.financial_entries
  add column if not exists confidence text;

alter table public.financial_entries
  add column if not exists mapping_explanation text;

create table if not exists public.account_mappings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  account_name text not null,
  account_name_key text not null,
  category normalized_category not null,
  statement_type statement_type not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, account_name_key)
);

create index if not exists idx_reporting_periods_company_id
  on public.reporting_periods(company_id);

create index if not exists idx_financial_entries_period_id
  on public.financial_entries(period_id);

create index if not exists idx_financial_entries_category
  on public.financial_entries(category);

create unique index if not exists idx_financial_entries_period_row_unique
  on public.financial_entries(
    period_id,
    account_name,
    statement_type,
    amount,
    category,
    addback_flag
  );

create index if not exists idx_account_mappings_company_id
  on public.account_mappings(company_id);

alter table public.companies enable row level security;
alter table public.reporting_periods enable row level security;
alter table public.financial_entries enable row level security;
alter table public.account_mappings enable row level security;

drop policy if exists "Allow authenticated users to manage companies"
  on public.companies;

create policy "Allow authenticated users to manage companies"
  on public.companies
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated users to manage periods"
  on public.reporting_periods;

create policy "Allow authenticated users to manage periods"
  on public.reporting_periods
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated users to manage entries"
  on public.financial_entries;

create policy "Allow authenticated users to manage entries"
  on public.financial_entries
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated users to manage account mappings"
  on public.account_mappings;

create policy "Allow authenticated users to manage account mappings"
  on public.account_mappings
  for all
  to authenticated
  using (true)
  with check (true);
