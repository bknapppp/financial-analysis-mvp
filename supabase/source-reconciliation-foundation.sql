begin;

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'financial_source_type'
  ) then
    create type financial_source_type as enum ('reported_financials', 'tax_return');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'financial_source_confidence'
  ) then
    create type financial_source_confidence as enum ('high', 'medium', 'low', 'unknown');
  end if;
end
$$;

create table if not exists public.source_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_type financial_source_type not null,
  source_file_name text,
  upload_id text,
  source_currency text,
  source_confidence financial_source_confidence,
  created_at timestamptz not null default now()
);

create table if not exists public.source_reporting_periods (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  label text not null,
  period_date date not null,
  source_period_label text,
  source_year integer,
  created_at timestamptz not null default now(),
  unique (source_document_id, period_date, label)
);

create table if not exists public.source_financial_entries (
  id uuid primary key default gen_random_uuid(),
  source_period_id uuid not null references public.source_reporting_periods(id) on delete cascade,
  account_name text not null,
  statement_type statement_type not null,
  amount numeric(14, 2) not null,
  category normalized_category not null,
  addback_flag boolean not null default false,
  matched_by text,
  confidence text,
  mapping_explanation text,
  created_at timestamptz not null default now()
);

create index if not exists idx_source_documents_company_source
  on public.source_documents(company_id, source_type, created_at);

create unique index if not exists idx_source_documents_company_upload
  on public.source_documents(company_id, source_type, upload_id)
  where upload_id is not null;

create index if not exists idx_source_reporting_periods_document_id
  on public.source_reporting_periods(source_document_id);

create index if not exists idx_source_reporting_periods_period_date
  on public.source_reporting_periods(period_date);

create index if not exists idx_source_financial_entries_source_period_id
  on public.source_financial_entries(source_period_id);

create index if not exists idx_source_financial_entries_category
  on public.source_financial_entries(category);

create unique index if not exists idx_source_financial_entries_period_row_unique
  on public.source_financial_entries(
    source_period_id,
    account_name,
    statement_type
  );

alter table public.source_documents enable row level security;
alter table public.source_reporting_periods enable row level security;
alter table public.source_financial_entries enable row level security;

drop policy if exists "Allow authenticated users to manage source documents"
  on public.source_documents;

create policy "Allow authenticated users to manage source documents"
  on public.source_documents
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated users to manage source reporting periods"
  on public.source_reporting_periods;

create policy "Allow authenticated users to manage source reporting periods"
  on public.source_reporting_periods
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated users to manage source financial entries"
  on public.source_financial_entries;

create policy "Allow authenticated users to manage source financial entries"
  on public.source_financial_entries
  for all
  to authenticated
  using (true)
  with check (true);

commit;
