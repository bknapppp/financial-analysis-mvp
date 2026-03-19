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

create table if not exists public.add_backs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_id uuid not null references public.reporting_periods(id) on delete cascade,
  linked_entry_id uuid references public.financial_entries(id) on delete set null,
  type text not null check (
    type in (
      'owner_related',
      'non_recurring',
      'discretionary',
      'non_operating',
      'accounting_normalization',
      'run_rate_adjustment'
    )
  ),
  description text not null,
  amount numeric(14, 2) not null,
  classification_confidence text not null check (
    classification_confidence in ('high', 'medium', 'low')
  ),
  source text not null check (source in ('system', 'user')),
  status text not null check (status in ('suggested', 'accepted', 'rejected')),
  justification text not null,
  supporting_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
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

create index if not exists idx_add_backs_company_id
  on public.add_backs(company_id);

create index if not exists idx_add_backs_period_id
  on public.add_backs(period_id);

create index if not exists idx_add_backs_linked_entry_id
  on public.add_backs(linked_entry_id);

alter table public.companies enable row level security;
alter table public.reporting_periods enable row level security;
alter table public.financial_entries enable row level security;
alter table public.account_mappings enable row level security;
alter table public.add_backs enable row level security;

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

drop policy if exists "Allow authenticated users to manage add-backs"
  on public.add_backs;

create policy "Allow authenticated users to manage add-backs"
  on public.add_backs
  for all
  to authenticated
  using (true)
  with check (true);
