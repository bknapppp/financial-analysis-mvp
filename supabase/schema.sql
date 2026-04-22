create extension if not exists "pgcrypto";

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'deal_stage'
  ) then
    create type deal_stage as enum ('new', 'screening', 'diligence', 'ic_ready', 'closing', 'closed', 'dead');
  end if;
end
$$;

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

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'document_type'
  ) then
    create type document_type as enum (
      'income_statement',
      'balance_sheet',
      'cash_flow',
      'tax_return',
      'bank_statement',
      'debt_schedule',
      'payroll_report',
      'loan_agreement',
      'other'
    );
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'document_source_kind'
  ) then
    create type document_source_kind as enum ('manual', 'import', 'integration');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'document_status'
  ) then
    create type document_status as enum ('active', 'archived');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'document_link_entity_type'
  ) then
    create type document_link_entity_type as enum (
      'source_requirement',
      'financial_line_item',
      'underwriting_adjustment',
      'issue',
      'underwriting_metric'
    );
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
      'Depreciation / Amortization',
      'Gross Profit',
      'EBITDA',
      'Operating Income',
      'Pre-tax',
      'Net Income',
      'Tax Expense',
      'Non-operating',
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
  stage deal_stage not null default 'new',
  stage_updated_at timestamptz not null default now(),
  stage_notes text,
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
  company_id uuid references public.companies(id) on delete cascade,
  account_name text not null,
  account_name_key text not null,
  normalized_label text,
  concept text,
  category normalized_category not null,
  statement_type statement_type not null,
  source_type financial_source_type,
  confidence text,
  source text,
  usage_count integer not null default 0,
  last_used_at timestamptz,
  mapping_method text,
  mapping_explanation text,
  matched_rule text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_mappings
  alter column company_id drop not null;

alter table public.account_mappings
  add column if not exists normalized_label text;

alter table public.account_mappings
  add column if not exists concept text;

alter table public.account_mappings
  add column if not exists source_type financial_source_type;

alter table public.account_mappings
  add column if not exists confidence text;

alter table public.account_mappings
  add column if not exists source text;

alter table public.account_mappings
  add column if not exists usage_count integer not null default 0;

alter table public.account_mappings
  add column if not exists last_used_at timestamptz;

alter table public.account_mappings
  add column if not exists mapping_method text;

alter table public.account_mappings
  add column if not exists mapping_explanation text;

alter table public.account_mappings
  add column if not exists matched_rule text;

update public.account_mappings
set normalized_label = coalesce(normalized_label, account_name_key)
where normalized_label is null;

alter table public.account_mappings
  alter column normalized_label set not null;

create table if not exists public.source_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text,
  document_type document_type,
  period_label text,
  fiscal_year integer,
  uploaded_at timestamptz not null default now(),
  uploaded_by text,
  source_kind document_source_kind not null default 'manual',
  status document_status not null default 'active',
  source_type financial_source_type not null,
  source_file_name text,
  upload_id text,
  source_currency text,
  source_confidence financial_source_confidence,
  created_at timestamptz not null default now()
);

alter table public.source_documents
  add column if not exists name text;

alter table public.source_documents
  add column if not exists document_type document_type;

alter table public.source_documents
  add column if not exists period_label text;

alter table public.source_documents
  add column if not exists fiscal_year integer;

alter table public.source_documents
  add column if not exists uploaded_at timestamptz not null default now();

alter table public.source_documents
  add column if not exists uploaded_by text;

alter table public.source_documents
  add column if not exists source_kind document_source_kind not null default 'manual';

alter table public.source_documents
  add column if not exists status document_status not null default 'active';

update public.source_documents
set
  name = coalesce(name, source_file_name, 'Document'),
  document_type = coalesce(
    document_type,
    case
      when source_type = 'tax_return' then 'tax_return'::document_type
      else 'other'::document_type
    end
  ),
  uploaded_at = coalesce(uploaded_at, created_at),
  source_kind = coalesce(source_kind, 'manual'::document_source_kind),
  status = coalesce(status, 'active'::document_status);

alter table public.source_documents
  alter column name set not null;

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

create table if not exists public.document_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.source_documents(id) on delete cascade,
  entity_type document_link_entity_type not null,
  entity_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.source_documents(id) on delete cascade,
  version_number integer not null,
  file_url text,
  storage_path text,
  uploaded_at timestamptz not null default now(),
  unique (document_id, version_number)
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

create table if not exists public.diligence_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_id uuid references public.reporting_periods(id) on delete cascade,
  source_type text not null check (source_type in ('system', 'manual')),
  issue_code text,
  title text not null,
  description text not null,
  category text not null check (
    category in (
      'source_data',
      'financials',
      'underwriting',
      'reconciliation',
      'validation',
      'credit',
      'tax',
      'diligence_request',
      'other'
    )
  ),
  severity text not null check (severity in ('low', 'medium', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'in_review', 'resolved', 'waived')),
  linked_page text not null check (linked_page in ('overview', 'financials', 'underwriting', 'source_data')),
  linked_field text,
  linked_route text,
  dedupe_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  waived_at timestamptz,
  created_by text,
  owner text,
  constraint diligence_issues_system_issue_code_check check (
    (source_type = 'system' and issue_code is not null)
    or (source_type = 'manual')
  )
);

create index if not exists idx_reporting_periods_company_id
  on public.reporting_periods(company_id);

create index if not exists idx_companies_stage
  on public.companies(stage);

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

create index if not exists idx_account_mappings_company_lookup
  on public.account_mappings(company_id, normalized_label, statement_type, source_type);

create index if not exists idx_account_mappings_shared_lookup
  on public.account_mappings(normalized_label, statement_type, source_type)
  where company_id is null;

create unique index if not exists idx_account_mappings_company_generic_unique
  on public.account_mappings(company_id, normalized_label, statement_type)
  where company_id is not null and source_type is null;

create unique index if not exists idx_account_mappings_company_source_unique
  on public.account_mappings(company_id, normalized_label, statement_type, source_type)
  where company_id is not null and source_type is not null;

create unique index if not exists idx_account_mappings_shared_generic_unique
  on public.account_mappings(normalized_label, statement_type)
  where company_id is null and source_type is null;

create unique index if not exists idx_account_mappings_shared_source_unique
  on public.account_mappings(normalized_label, statement_type, source_type)
  where company_id is null and source_type is not null;

create index if not exists idx_source_documents_company_source
  on public.source_documents(company_id, source_type, created_at);

create index if not exists idx_source_documents_document_type
  on public.source_documents(company_id, document_type, status, uploaded_at desc);

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

create index if not exists idx_document_links_company_id
  on public.document_links(company_id);

create index if not exists idx_document_links_document_id
  on public.document_links(document_id);

create unique index if not exists idx_document_links_unique_target
  on public.document_links(company_id, document_id, entity_type, entity_id);

create index if not exists idx_document_versions_document_id
  on public.document_versions(document_id, version_number desc);

create unique index if not exists idx_source_financial_entries_period_row_unique
  on public.source_financial_entries(
    source_period_id,
    account_name,
    statement_type
  );

create index if not exists idx_add_backs_company_id
  on public.add_backs(company_id);

create index if not exists idx_add_backs_period_id
  on public.add_backs(period_id);

create index if not exists idx_add_backs_linked_entry_id
  on public.add_backs(linked_entry_id);

create index if not exists idx_diligence_issues_company_id
  on public.diligence_issues(company_id);

create index if not exists idx_diligence_issues_period_id
  on public.diligence_issues(period_id);

create index if not exists idx_diligence_issues_status
  on public.diligence_issues(status);

create index if not exists idx_diligence_issues_linked_page
  on public.diligence_issues(linked_page);

create index if not exists idx_diligence_issues_source_type
  on public.diligence_issues(source_type);

create unique index if not exists idx_diligence_issues_system_dedupe
  on public.diligence_issues(company_id, dedupe_key)
  where source_type = 'system' and dedupe_key is not null;

alter table public.companies enable row level security;
alter table public.reporting_periods enable row level security;
alter table public.financial_entries enable row level security;
alter table public.account_mappings enable row level security;
alter table public.add_backs enable row level security;
alter table public.source_documents enable row level security;
alter table public.source_reporting_periods enable row level security;
alter table public.source_financial_entries enable row level security;
alter table public.document_links enable row level security;
alter table public.document_versions enable row level security;
alter table public.diligence_issues enable row level security;

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

drop policy if exists "Allow authenticated users to manage document links"
  on public.document_links;

create policy "Allow authenticated users to manage document links"
  on public.document_links
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated users to manage document versions"
  on public.document_versions;

create policy "Allow authenticated users to manage document versions"
  on public.document_versions
  for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "Allow authenticated users to manage diligence issues"
  on public.diligence_issues;

create policy "Allow authenticated users to manage diligence issues"
  on public.diligence_issues
  for all
  to authenticated
  using (true)
  with check (true);
