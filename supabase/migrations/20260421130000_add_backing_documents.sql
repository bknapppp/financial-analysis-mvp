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

create index if not exists idx_source_documents_document_type
  on public.source_documents(company_id, document_type, status, uploaded_at desc);

create index if not exists idx_document_links_company_id
  on public.document_links(company_id);

create index if not exists idx_document_links_document_id
  on public.document_links(document_id);

create unique index if not exists idx_document_links_unique_target
  on public.document_links(company_id, document_id, entity_type, entity_id);

create index if not exists idx_document_versions_document_id
  on public.document_versions(document_id, version_number desc);

alter table public.document_links enable row level security;
alter table public.document_versions enable row level security;

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
