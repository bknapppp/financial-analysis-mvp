begin;

create table if not exists public.diligence_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  period_id uuid references public.reporting_periods(id) on delete cascade,
  source_type text not null check (source_type in ('system', 'manual')),
  issue_code text null,
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

alter table public.diligence_issues enable row level security;

drop policy if exists "Allow authenticated users to manage diligence issues"
  on public.diligence_issues;

create policy "Allow authenticated users to manage diligence issues"
  on public.diligence_issues
  for all
  to authenticated
  using (true)
  with check (true);

commit;
