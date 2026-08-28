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
  deal_name text,
  deal_type text,
  status text not null default 'New',
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
  category normalized_category,
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

-- Phase 3 workflow persistence. These tables are intentionally server-only:
-- RLS is enabled without broad authenticated policies.
create table if not exists public.deal_phases (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  phase_key text not null check (phase_key in ('planning','information_request','data_review','findings','reporting','close')),
  status text not null default 'not_started' check (status in ('not_started','in_progress','awaiting_review','changes_requested','blocked','complete')),
  submitted_by_user_id uuid references auth.users(id) on delete set null, submitted_by_name text, submitted_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null, reviewed_by_name text, reviewed_at timestamptz,
  reviewer_decision text check (reviewer_decision is null or reviewer_decision in ('approved','changes_requested')), reviewer_rationale text,
  reopened_at timestamptz, completion_basis jsonb, version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(company_id, phase_key),
  constraint deal_phases_complete_review_check check (status <> 'complete' or reviewer_decision = 'approved')
);
create table if not exists public.analysis_procedures (
  id uuid primary key default gen_random_uuid(), phase_id uuid not null references public.deal_phases(id) on delete cascade,
  procedure_key text not null, template_version text not null, workstream_key text not null, title text not null, required boolean not null default true,
  owner_user_id uuid references auth.users(id) on delete set null, owner_name text, reviewer_user_id uuid references auth.users(id) on delete set null, reviewer_name text,
  status text not null default 'not_started' check (status in ('not_started','in_progress','ready_for_review','complete','blocked')),
  due_date date, result_summary text, started_at timestamptz, completed_at timestamptz,
  completed_by_user_id uuid references auth.users(id) on delete set null, completed_by_name text,
  version integer not null default 1 check (version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(phase_id, procedure_key), constraint analysis_procedures_complete_check check (status <> 'complete' or completed_at is not null)
);
create table if not exists public.analysis_investigations (
  id uuid primary key default gen_random_uuid(), phase_id uuid not null references public.deal_phases(id) on delete cascade,
  procedure_id uuid references public.analysis_procedures(id) on delete set null, reference_code text not null, title text not null,
  signal_type text not null check (signal_type in ('manual','mapping_exception','reconciliation_exception','data_quality','document_gap','add_back','financial_variance','system_issue','other')),
  signal_key text, signal_summary text not null, signal_snapshot jsonb, period_id uuid references public.reporting_periods(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null, owner_name text, reviewer_user_id uuid references auth.users(id) on delete set null, reviewer_name text,
  priority text not null check (priority in ('low','medium','high','critical')), status text not null default 'open' check (status in ('open','in_progress','ready_for_review','closed')),
  notes text, conclusion text, disposition text check (disposition is null or disposition in ('resolved','immaterial','adjustment_proposed','further_support_required','promote_to_finding')),
  materiality_rationale text, promoted_issue_id uuid references public.diligence_issues(id) on delete set null,
  opened_by_user_id uuid references auth.users(id) on delete set null, opened_by_name text not null, opened_at timestamptz not null default now(),
  resolved_by_user_id uuid references auth.users(id) on delete set null, resolved_by_name text, resolved_at timestamptz,
  version integer not null default 1 check (version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(phase_id, reference_code), constraint analysis_investigations_closed_check check (status <> 'closed' or (nullif(trim(conclusion),'') is not null and disposition is not null and resolved_at is not null))
);
create table if not exists public.investigation_evidence (
  id uuid primary key default gen_random_uuid(), investigation_id uuid not null references public.analysis_investigations(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('source_document','document_version','reporting_period','financial_entry','source_financial_entry','account_mapping','add_back','diligence_issue')),
  evidence_id uuid not null, relationship text not null default 'supports' check (relationship in ('source','supports','contradicts','related','result')),
  label_snapshot text, attached_by_user_id uuid references auth.users(id) on delete set null, attached_by_name text not null,
  created_at timestamptz not null default now(), unique(investigation_id,evidence_type,evidence_id,relationship)
);
create table if not exists public.phase_activity (
  id uuid primary key default gen_random_uuid(), phase_id uuid not null references public.deal_phases(id) on delete cascade,
  subject_type text not null check (subject_type in ('phase','procedure','investigation','evidence','finding')), subject_id uuid,
  event_type text not null check (event_type in ('phase_initialized','procedure_status_changed','procedure_assignment_changed','investigation_opened','investigation_updated','investigation_assignment_changed','investigation_dispositioned','investigation_waiver_approved','investigation_waiver_revoked','evidence_attached','evidence_detached','finding_promoted','review_comment_added','phase_submitted','changes_requested','phase_approved','phase_reopened')),
  from_state text, to_state text, rationale text, comment_text text, metadata jsonb,
  actor_user_id uuid references auth.users(id) on delete set null, actor_name text not null, created_at timestamptz not null default now()
);
create index if not exists idx_deal_phases_company_status on public.deal_phases(company_id,status);
create index if not exists idx_analysis_procedures_phase_status on public.analysis_procedures(phase_id,status);
create index if not exists idx_analysis_procedures_owner_status on public.analysis_procedures(owner_user_id,status);
create index if not exists idx_analysis_investigations_phase_status_priority on public.analysis_investigations(phase_id,status,priority);
create index if not exists idx_analysis_investigations_procedure_status on public.analysis_investigations(procedure_id,status);
create index if not exists idx_analysis_investigations_promoted_issue on public.analysis_investigations(promoted_issue_id);
create unique index if not exists idx_analysis_investigations_unique_promoted_issue on public.analysis_investigations(promoted_issue_id) where promoted_issue_id is not null;
create unique index if not exists idx_analysis_investigations_signal_dedupe on public.analysis_investigations(phase_id,signal_type,signal_key) where signal_key is not null;
create index if not exists idx_investigation_evidence_investigation on public.investigation_evidence(investigation_id);
create index if not exists idx_investigation_evidence_target on public.investigation_evidence(evidence_type,evidence_id);
create index if not exists idx_phase_activity_phase_created on public.phase_activity(phase_id,created_at desc);
create index if not exists idx_phase_activity_subject_created on public.phase_activity(subject_type,subject_id,created_at desc);
create index if not exists idx_phase_activity_event_created on public.phase_activity(event_type,created_at desc);
alter table public.deal_phases enable row level security;
alter table public.analysis_procedures enable row level security;
alter table public.analysis_investigations enable row level security;
alter table public.investigation_evidence enable row level security;
alter table public.phase_activity enable row level security;

create or replace function public.initialize_phase3(p_company_id uuid,p_actor_name text,p_procedures jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_phase_id uuid;
begin
  if nullif(trim(p_actor_name),'') is null then raise exception 'actor is required'; end if;
  if not exists(select 1 from public.companies where id=p_company_id) then raise exception 'company not found'; end if;
  insert into public.deal_phases(company_id,phase_key,status) values(p_company_id,'data_review','in_progress') on conflict(company_id,phase_key) do nothing;
  select id into v_phase_id from public.deal_phases where company_id=p_company_id and phase_key='data_review';
  insert into public.analysis_procedures(phase_id,procedure_key,template_version,workstream_key,title,required)
  select v_phase_id,x.procedure_key,x.template_version,x.workstream_key,x.title,x.required
  from jsonb_to_recordset(p_procedures) as x(procedure_key text,template_version text,workstream_key text,title text,required boolean)
  on conflict(phase_id,procedure_key) do nothing;
  if not exists(select 1 from public.phase_activity where phase_id=v_phase_id and event_type='phase_initialized') then
    insert into public.phase_activity(phase_id,subject_type,subject_id,event_type,actor_name) values(v_phase_id,'phase',v_phase_id,'phase_initialized',p_actor_name);
  end if;
  return v_phase_id;
end; $$;

create or replace function public.create_phase3_investigation(
  p_phase_id uuid,p_procedure_id uuid,p_title text,p_signal_type text,p_signal_key text,p_signal_summary text,
  p_signal_snapshot jsonb,p_period_id uuid,p_owner_name text,p_reviewer_name text,p_priority text,p_actor_name text
) returns public.analysis_investigations language plpgsql security definer set search_path=public as $$
declare v_next integer;v_row public.analysis_investigations;
begin
  perform 1 from public.deal_phases where id=p_phase_id and phase_key='data_review' for update;
  if not found then raise exception 'phase not found'; end if;
  select coalesce(max(substring(reference_code from 5)::integer),0)+1 into v_next from public.analysis_investigations where phase_id=p_phase_id and reference_code~'^INV-[0-9]+$';
  insert into public.analysis_investigations(phase_id,procedure_id,reference_code,title,signal_type,signal_key,signal_summary,signal_snapshot,period_id,owner_name,reviewer_name,priority,opened_by_name)
  values(p_phase_id,p_procedure_id,'INV-'||lpad(v_next::text,3,'0'),trim(p_title),p_signal_type,nullif(trim(p_signal_key),''),trim(p_signal_summary),p_signal_snapshot,p_period_id,nullif(trim(p_owner_name),''),nullif(trim(p_reviewer_name),''),p_priority,p_actor_name)
  returning * into v_row;
  insert into public.phase_activity(phase_id,subject_type,subject_id,event_type,to_state,actor_name) values(p_phase_id,'investigation',v_row.id,'investigation_opened','open',p_actor_name);
  return v_row;
end; $$;

create or replace function public.promote_phase3_investigation(
  p_company_id uuid,p_investigation_id uuid,p_expected_version integer,p_category text,p_severity text,p_actor_name text
) returns table(issue_id uuid,already_promoted boolean) language plpgsql security definer set search_path=public as $$
declare v_inv public.analysis_investigations;v_issue uuid;
begin
  select i.* into v_inv from public.analysis_investigations i join public.deal_phases p on p.id=i.phase_id
  where i.id=p_investigation_id and p.company_id=p_company_id and p.phase_key='data_review' for update of i;
  if not found then raise exception 'investigation not found'; end if;
  if v_inv.promoted_issue_id is not null then return query select v_inv.promoted_issue_id,true;return;end if;
  if v_inv.version<>p_expected_version then raise exception 'stale version' using errcode='40001';end if;
  if nullif(trim(v_inv.conclusion),'') is null then raise exception 'conclusion is required';end if;
  if not exists(select 1 from public.investigation_evidence where investigation_id=v_inv.id) then raise exception 'evidence is required';end if;
  insert into public.diligence_issues(company_id,period_id,source_type,issue_code,title,description,category,severity,status,linked_page,linked_field,linked_route,dedupe_key,created_by,owner)
  values(p_company_id,v_inv.period_id,'manual',null,v_inv.title,v_inv.signal_summary||E'\n\nAnalyst conclusion: '||v_inv.conclusion,p_category,p_severity,'open','overview','phase3-investigation','/deal/'||p_company_id||'/phases/data-review?investigation='||v_inv.id,null,p_actor_name,v_inv.owner_name)
  returning id into v_issue;
  update public.analysis_investigations set disposition='promote_to_finding',status='closed',promoted_issue_id=v_issue,resolved_at=now(),resolved_by_name=p_actor_name,version=version+1,updated_at=now() where id=v_inv.id;
  insert into public.phase_activity(phase_id,subject_type,subject_id,event_type,from_state,to_state,metadata,actor_name)
  values(v_inv.phase_id,'finding',v_issue,'finding_promoted',v_inv.status,'closed',jsonb_build_object('investigationId',v_inv.id,'issueId',v_issue),p_actor_name);
  return query select v_issue,false;
end; $$;

revoke all on function public.initialize_phase3(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.create_phase3_investigation(uuid,uuid,text,text,text,text,jsonb,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function public.promote_phase3_investigation(uuid,uuid,integer,text,text,text) from public,anon,authenticated;
begin;

create table if not exists public.finding_profiles (
  issue_id uuid primary key references public.diligence_issues(id) on delete cascade,
  phase_id uuid not null references public.deal_phases(id) on delete cascade,
  reference_code text not null check (reference_code ~ '^FND-[0-9]{3,}$'),
  finding_type text not null check (finding_type in ('financial','operational','tax','accounting','data_quality','commercial','legal_compliance','other')),
  materiality text not null default 'undetermined' check (materiality in ('undetermined','immaterial','quantitatively_material','qualitatively_material','both')),
  materiality_rationale text,
  finding_narrative text not null,
  transaction_implication text,
  recommendation text,
  resolution_narrative text,
  management_response_status text not null default 'not_requested' check (management_response_status in ('not_requested','requested','received','under_review','accepted','insufficient')),
  management_response text, management_response_received_at timestamptz,
  management_response_entered_by_user_id uuid references auth.users(id) on delete set null, management_response_entered_by_name text,
  management_response_evaluation text, management_response_evaluated_at timestamptz,
  management_response_evaluated_by_user_id uuid references auth.users(id) on delete set null, management_response_evaluated_by_name text,
  reporting_treatment text not null default 'undetermined' check (reporting_treatment in ('undetermined','internal_only','exclude','report_observation','key_finding')),
  reporting_rationale text, executive_summary boolean not null default false,
  include_in_qoe_adjustments boolean not null default false, transaction_consideration boolean not null default false,
  approved_report_language text,
  review_status text not null default 'draft' check (review_status in ('draft','ready_for_review','changes_requested','approved')),
  owner_user_id uuid references auth.users(id) on delete set null, owner_name text,
  reviewer_user_id uuid references auth.users(id) on delete set null, reviewer_name text, due_date date,
  submitted_by_user_id uuid references auth.users(id) on delete set null, submitted_by_name text, submitted_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null, reviewed_by_name text, reviewed_at timestamptz,
  reviewer_rationale text, reopened_at timestamptz,
  version integer not null default 1 check (version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(phase_id, reference_code),
  constraint finding_profile_exclusion_rationale check (reporting_treatment <> 'exclude' or nullif(trim(reporting_rationale),'') is not null)
);

create table if not exists public.finding_investigations (
  issue_id uuid not null references public.diligence_issues(id) on delete cascade,
  investigation_id uuid not null references public.analysis_investigations(id) on delete cascade,
  relationship text not null check (relationship in ('originating','supporting')),
  linked_by_user_id uuid references auth.users(id) on delete set null, linked_by_name text not null,
  created_at timestamptz not null default now(), primary key(issue_id, investigation_id)
);

create table if not exists public.finding_impacts (
  id uuid primary key default gen_random_uuid(), issue_id uuid not null references public.diligence_issues(id) on delete cascade,
  dimension text not null check (dimension in ('revenue','gross_profit','ebitda','working_capital','net_debt','cash','purchase_price','enterprise_value','equity_value','tax','customer_concentration','revenue_durability','operational_risk','data_quality','accounting_policy','legal_compliance','other')),
  impact_state text not null check (impact_state in ('none','known','estimated','range','unknown')),
  currency text, amount numeric(18,2), range_low numeric(18,2), range_high numeric(18,2),
  period_id uuid references public.reporting_periods(id) on delete set null, basis text,
  created_by_user_id uuid references auth.users(id) on delete set null, created_by_name text not null,
  version integer not null default 1 check (version > 0), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint finding_impact_shape check (
    (impact_state in ('known','estimated') and amount is not null and range_low is null and range_high is null and nullif(trim(currency),'') is not null and nullif(trim(basis),'') is not null)
    or (impact_state='range' and amount is null and range_low is not null and range_high is not null and range_low <= range_high and nullif(trim(currency),'') is not null and nullif(trim(basis),'') is not null)
    or (impact_state in ('none','unknown') and amount is null and range_low is null and range_high is null)
  )
);

create table if not exists public.finding_add_backs (
  issue_id uuid not null references public.diligence_issues(id) on delete cascade,
  add_back_id uuid not null references public.add_backs(id) on delete cascade,
  relationship text not null check (relationship in ('supports','disputed','affected')),
  linked_by_user_id uuid references auth.users(id) on delete set null, linked_by_name text not null,
  created_at timestamptz not null default now(), primary key(issue_id,add_back_id,relationship)
);

create table if not exists public.finding_evidence (
  id uuid primary key default gen_random_uuid(), issue_id uuid not null references public.diligence_issues(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('source_document','document_version','reporting_period','financial_entry','source_financial_entry','account_mapping','add_back','diligence_issue')),
  evidence_id uuid not null, relationship text not null default 'supports' check (relationship in ('source','supports','contradicts','related','result')),
  label_snapshot text, attached_by_user_id uuid references auth.users(id) on delete set null, attached_by_name text not null,
  created_at timestamptz not null default now(), unique(issue_id,evidence_type,evidence_id,relationship)
);

create index if not exists idx_finding_profiles_phase_review on public.finding_profiles(phase_id,review_status);
create index if not exists idx_finding_profiles_reviewer_review on public.finding_profiles(reviewer_user_id,review_status);
create index if not exists idx_finding_profiles_reporting on public.finding_profiles(reporting_treatment);
create index if not exists idx_finding_profiles_materiality on public.finding_profiles(materiality);
create index if not exists idx_finding_investigations_investigation on public.finding_investigations(investigation_id);
create index if not exists idx_finding_impacts_issue_dimension on public.finding_impacts(issue_id,dimension);
create index if not exists idx_finding_add_backs_add_back on public.finding_add_backs(add_back_id);
create index if not exists idx_finding_evidence_issue on public.finding_evidence(issue_id);
create index if not exists idx_finding_evidence_target on public.finding_evidence(evidence_type,evidence_id);

alter table public.finding_profiles enable row level security;
alter table public.finding_investigations enable row level security;
alter table public.finding_impacts enable row level security;
alter table public.finding_add_backs enable row level security;
alter table public.finding_evidence enable row level security;

alter table public.phase_activity drop constraint if exists phase_activity_event_type_check;
alter table public.phase_activity add constraint phase_activity_event_type_check check (event_type in (
  'phase_initialized','procedure_status_changed','procedure_assignment_changed','investigation_opened','investigation_updated','investigation_assignment_changed','investigation_dispositioned','investigation_waiver_approved','investigation_waiver_revoked','evidence_attached','evidence_detached','finding_promoted','review_comment_added','phase_submitted','changes_requested','phase_approved','phase_reopened',
  'finding_admitted','manual_finding_created','finding_updated','finding_assignment_changed','finding_materiality_changed','finding_impact_updated','finding_evidence_linked','finding_evidence_unlinked','finding_investigation_linked','finding_investigation_unlinked','finding_add_back_linked','finding_add_back_unlinked','management_response_requested','management_response_recorded','management_response_evaluated','management_response_waived','management_response_reinstated','finding_recommendation_updated','finding_reporting_treatment_changed','finding_submitted','finding_changes_requested','finding_approved','finding_reopened'
));

create or replace function public.next_phase4_reference(p_phase_id uuid) returns text
language plpgsql security definer set search_path=public as $$
declare v_next integer;
begin
  perform 1 from public.deal_phases where id=p_phase_id and phase_key='findings' for update;
  if not found then raise exception 'findings phase not found'; end if;
  select coalesce(max(substring(reference_code from 5)::integer),0)+1 into v_next from public.finding_profiles where phase_id=p_phase_id;
  return 'FND-'||lpad(v_next::text,3,'0');
end; $$;

create or replace function public.initialize_phase4(p_company_id uuid,p_actor_name text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_phase_id uuid; v_inv record;
begin
  if nullif(trim(p_actor_name),'') is null then raise exception 'actor is required'; end if;
  if not exists(select 1 from public.companies where id=p_company_id) then raise exception 'company not found'; end if;
  insert into public.deal_phases(company_id,phase_key,status) values(p_company_id,'findings','in_progress') on conflict(company_id,phase_key) do nothing;
  select id into v_phase_id from public.deal_phases where company_id=p_company_id and phase_key='findings';
  perform 1 from public.deal_phases where id=v_phase_id for update;
  for v_inv in select i.*,d.title,d.description,d.category,d.owner from public.analysis_investigations i join public.deal_phases p on p.id=i.phase_id join public.diligence_issues d on d.id=i.promoted_issue_id where p.company_id=p_company_id and i.promoted_issue_id is not null loop
    insert into public.finding_profiles(issue_id,phase_id,reference_code,finding_type,finding_narrative,owner_name)
    values(v_inv.promoted_issue_id,v_phase_id,public.next_phase4_reference(v_phase_id),case when v_inv.category='tax' then 'tax' when v_inv.category in ('financials','underwriting','reconciliation','credit') then 'financial' when v_inv.category in ('source_data','validation') then 'data_quality' else 'other' end,v_inv.description,v_inv.owner)
    on conflict(issue_id) do nothing;
    insert into public.finding_investigations(issue_id,investigation_id,relationship,linked_by_name) values(v_inv.promoted_issue_id,v_inv.id,'originating',p_actor_name) on conflict do nothing;
  end loop;
  if not exists(select 1 from public.phase_activity where phase_id=v_phase_id and event_type='phase_initialized') then insert into public.phase_activity(phase_id,subject_type,subject_id,event_type,actor_name,metadata) values(v_phase_id,'phase',v_phase_id,'phase_initialized',p_actor_name,jsonb_build_object('phase','findings')); end if;
  return v_phase_id;
end; $$;

create or replace function public.admit_phase4_issue(p_company_id uuid,p_issue_id uuid,p_finding_type text,p_actor_name text)
returns public.finding_profiles language plpgsql security definer set search_path=public as $$
declare v_phase_id uuid; v_issue public.diligence_issues; v_profile public.finding_profiles;
begin
  select * into v_issue from public.diligence_issues where id=p_issue_id and company_id=p_company_id;
  if not found then raise exception 'issue not found'; end if;
  select id into v_phase_id from public.deal_phases where company_id=p_company_id and phase_key='findings';
  if v_phase_id is null then raise exception 'phase not initialized'; end if;
  select * into v_profile from public.finding_profiles where issue_id=p_issue_id;
  if found then return v_profile; end if;
  insert into public.finding_profiles(issue_id,phase_id,reference_code,finding_type,finding_narrative,owner_name)
  values(p_issue_id,v_phase_id,public.next_phase4_reference(v_phase_id),p_finding_type,v_issue.description,v_issue.owner) returning * into v_profile;
  insert into public.phase_activity(phase_id,subject_type,subject_id,event_type,actor_name) values(v_phase_id,'finding',p_issue_id,'finding_admitted',p_actor_name);
  return v_profile;
end; $$;

create or replace function public.create_phase4_manual_finding(
  p_company_id uuid,p_period_id uuid,p_title text,p_description text,p_category text,p_severity text,p_finding_type text,p_actor_name text
) returns public.finding_profiles language plpgsql security definer set search_path=public as $$
declare v_phase_id uuid; v_issue_id uuid; v_profile public.finding_profiles;
begin
  select id into v_phase_id from public.deal_phases where company_id=p_company_id and phase_key='findings';
  if v_phase_id is null then raise exception 'phase not initialized'; end if;
  if p_period_id is not null and not exists(select 1 from public.reporting_periods where id=p_period_id and company_id=p_company_id) then raise exception 'period belongs to another deal'; end if;
  insert into public.diligence_issues(company_id,period_id,source_type,title,description,category,severity,status,linked_page,linked_field,linked_route,created_by)
  values(p_company_id,p_period_id,'manual',trim(p_title),trim(p_description),p_category,p_severity,'open','overview','phase4-finding','/deal/'||p_company_id||'/phases/findings',p_actor_name) returning id into v_issue_id;
  insert into public.finding_profiles(issue_id,phase_id,reference_code,finding_type,finding_narrative)
  values(v_issue_id,v_phase_id,public.next_phase4_reference(v_phase_id),p_finding_type,trim(p_description)) returning * into v_profile;
  insert into public.phase_activity(phase_id,subject_type,subject_id,event_type,actor_name) values(v_phase_id,'finding',v_issue_id,'manual_finding_created',p_actor_name);
  return v_profile;
end; $$;

revoke all on function public.next_phase4_reference(uuid) from public,anon,authenticated;
revoke all on function public.initialize_phase4(uuid,text) from public,anon,authenticated;
revoke all on function public.admit_phase4_issue(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.create_phase4_manual_finding(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
commit;

begin;

alter table public.finding_profiles add column if not exists approved_version integer;
update public.finding_profiles set approved_version=version where review_status='approved' and approved_version is null;
alter table public.finding_profiles drop constraint if exists finding_profile_current_approval;
alter table public.finding_profiles add constraint finding_profile_current_approval check (
  review_status <> 'approved' or (approved_version = version and reviewed_at is not null and reviewed_by_name is not null)
);

create or replace function public.phase4_invalidate_profile_update() returns trigger language plpgsql set search_path=public as $$
begin
  if new.review_status='approved' and old.review_status<>'approved' then new.approved_version:=new.version;
  elsif new.review_status<>'approved' then new.approved_version:=null; end if;
  if old.review_status='approved' and (
    new.finding_type is distinct from old.finding_type or new.materiality is distinct from old.materiality or
    new.materiality_rationale is distinct from old.materiality_rationale or new.finding_narrative is distinct from old.finding_narrative or
    new.transaction_implication is distinct from old.transaction_implication or new.recommendation is distinct from old.recommendation or
    new.resolution_narrative is distinct from old.resolution_narrative or new.management_response_status is distinct from old.management_response_status or
    new.management_response is distinct from old.management_response or new.management_response_evaluation is distinct from old.management_response_evaluation or
    new.reporting_treatment is distinct from old.reporting_treatment or new.reporting_rationale is distinct from old.reporting_rationale or
    new.executive_summary is distinct from old.executive_summary or new.include_in_qoe_adjustments is distinct from old.include_in_qoe_adjustments or
    new.transaction_consideration is distinct from old.transaction_consideration or new.approved_report_language is distinct from old.approved_report_language
  ) then
    new.review_status:='draft'; new.approved_version:=null; new.reviewed_by_user_id:=null; new.reviewed_by_name:=null;
    new.reviewed_at:=null; new.reviewer_rationale:=null; new.reopened_at:=now();
  end if;
  return new;
end $$;

create or replace function public.phase4_reopen_completed_phase() returns trigger language plpgsql set search_path=public as $$
declare v_phase uuid;
begin
  if tg_table_name='finding_profiles' then v_phase:=coalesce(new.phase_id,old.phase_id);
  elsif tg_table_name='diligence_issues' then select phase_id into v_phase from public.finding_profiles where issue_id=coalesce(new.id,old.id); end if;
  update public.deal_phases set status='in_progress',reviewer_decision=null,reviewer_rationale=null,reviewed_by_user_id=null,
    reviewed_by_name=null,reviewed_at=null,reopened_at=now(),version=version+1,updated_at=now()
  where id=v_phase and status='complete';
  return coalesce(new,old);
end $$;

create or replace function public.phase4_invalidate_relationship_change() returns trigger language plpgsql set search_path=public as $$
declare v_issue uuid;v_phase uuid;
begin
  v_issue:=coalesce(new.issue_id,old.issue_id);
  update public.finding_profiles set review_status='draft',approved_version=null,reviewed_by_user_id=null,reviewed_by_name=null,
    reviewed_at=null,reviewer_rationale=null,reopened_at=now(),version=version+1,updated_at=now()
  where issue_id=v_issue and review_status='approved' returning phase_id into v_phase;
  if v_phase is null then select phase_id into v_phase from public.finding_profiles where issue_id=v_issue; end if;
  update public.deal_phases set status='in_progress',reviewer_decision=null,reviewer_rationale=null,reviewed_by_user_id=null,
    reviewed_by_name=null,reviewed_at=null,reopened_at=now(),version=version+1,updated_at=now()
  where id=v_phase and status='complete';
  return coalesce(new,old);
end $$;

create or replace function public.phase4_invalidate_issue_change() returns trigger language plpgsql set search_path=public as $$
declare v_phase uuid;
begin
  update public.finding_profiles set review_status='draft',approved_version=null,reviewed_by_user_id=null,reviewed_by_name=null,
    reviewed_at=null,reviewer_rationale=null,reopened_at=now(),version=version+1,updated_at=now()
  where issue_id=new.id and review_status='approved' returning phase_id into v_phase;
  if v_phase is null then select phase_id into v_phase from public.finding_profiles where issue_id=new.id; end if;
  update public.deal_phases set status='in_progress',reviewer_decision=null,reviewer_rationale=null,reviewed_by_user_id=null,
    reviewed_by_name=null,reviewed_at=null,reopened_at=now(),version=version+1,updated_at=now()
  where id=v_phase and status='complete'; return new;
end $$;

create or replace function public.phase4_invalidate_waiver_change() returns trigger language plpgsql set search_path=public as $$
declare v_phase uuid;
begin
  if new.event_type not in ('management_response_waived','management_response_reinstated') then return new; end if;
  update public.finding_profiles set review_status='draft',approved_version=null,reviewed_by_user_id=null,reviewed_by_name=null,
    reviewed_at=null,reviewer_rationale=null,reopened_at=now(),version=version+1,updated_at=now()
  where issue_id=new.subject_id and review_status='approved' returning phase_id into v_phase;
  update public.deal_phases set status='in_progress',reviewer_decision=null,reviewer_rationale=null,reviewed_by_user_id=null,
    reviewed_by_name=null,reviewed_at=null,reopened_at=now(),version=version+1,updated_at=now()
  where id=v_phase and status='complete'; return new;
end $$;

create or replace function public.phase4_validate_relationship_scope() returns trigger language plpgsql set search_path=public as $$
declare v_company uuid;v_related uuid;
begin
  select d.company_id into v_company from public.diligence_issues d where d.id=new.issue_id;
  if tg_table_name='finding_impacts' and new.period_id is not null then select company_id into v_related from public.reporting_periods where id=new.period_id;
  elsif tg_table_name='finding_investigations' then select p.company_id into v_related from public.analysis_investigations i join public.deal_phases p on p.id=i.phase_id where i.id=new.investigation_id;
  elsif tg_table_name='finding_add_backs' then select company_id into v_related from public.add_backs where id=new.add_back_id;
  else return new; end if;
  if v_company is null or v_related is null or v_company<>v_related then raise exception 'Phase 4 relationship belongs to another deal'; end if;
  return new;
end $$;

drop trigger if exists trg_phase4_profile_invalidation on public.finding_profiles;
create trigger trg_phase4_profile_invalidation before update on public.finding_profiles for each row execute function public.phase4_invalidate_profile_update();
drop trigger if exists trg_phase4_profile_phase_reopen on public.finding_profiles;
create trigger trg_phase4_profile_phase_reopen after update on public.finding_profiles for each row when (old.review_status='approved' and new.review_status<>'approved') execute function public.phase4_reopen_completed_phase();
drop trigger if exists trg_phase4_issue_phase_reopen on public.diligence_issues;
create trigger trg_phase4_issue_phase_reopen after update of title,description,category,severity,status on public.diligence_issues for each row when (old.* is distinct from new.*) execute function public.phase4_invalidate_issue_change();
drop trigger if exists trg_phase4_waiver_invalidation on public.phase_activity;
create trigger trg_phase4_waiver_invalidation after insert on public.phase_activity for each row execute function public.phase4_invalidate_waiver_change();

do $$ declare t text; begin foreach t in array array['finding_impacts','finding_investigations','finding_evidence','finding_add_backs'] loop
  execute format('drop trigger if exists trg_phase4_relation_invalidation on public.%I',t);
  execute format('create trigger trg_phase4_relation_invalidation after insert or update or delete on public.%I for each row execute function public.phase4_invalidate_relationship_change()',t);
end loop;end $$;
do $$ declare t text; begin foreach t in array array['finding_impacts','finding_investigations','finding_add_backs'] loop
  execute format('drop trigger if exists trg_phase4_scope on public.%I',t);
  execute format('create trigger trg_phase4_scope before insert or update on public.%I for each row execute function public.phase4_validate_relationship_scope()',t);
end loop;end $$;

commit;
begin;

create or replace function public.phase4_validate_relationship_scope() returns trigger
language plpgsql set search_path=public as $$
declare
  v_company uuid;
  v_related uuid;
begin
  select d.company_id into v_company
  from public.diligence_issues d
  where d.id=new.issue_id;

  if tg_table_name='finding_impacts' then
    if new.period_id is null then return new; end if;
    select company_id into v_related from public.reporting_periods where id=new.period_id;
  elsif tg_table_name='finding_investigations' then
    select p.company_id into v_related
    from public.analysis_investigations i
    join public.deal_phases p on p.id=i.phase_id
    where i.id=new.investigation_id;
  elsif tg_table_name='finding_add_backs' then
    select company_id into v_related from public.add_backs where id=new.add_back_id;
  else
    return new;
  end if;

  if v_company is null or v_related is null or v_company<>v_related then
    raise exception 'Phase 4 relationship belongs to another deal';
  end if;
  return new;
end $$;

commit;

begin;

drop trigger if exists trg_phase4_issue_phase_reopen on public.diligence_issues;
create trigger trg_phase4_issue_phase_reopen
after update of title,description,category,severity,status on public.diligence_issues
for each row
when (
  old.title is distinct from new.title or
  old.description is distinct from new.description or
  old.category is distinct from new.category or
  old.severity is distinct from new.severity or
  old.status is distinct from new.status
)
execute function public.phase4_invalidate_issue_change();

commit;
