begin;

create extension if not exists "pgcrypto";

create table if not exists public.deal_memory (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null,
  company_id uuid not null,
  snapshot_at timestamptz not null default now(),
  revenue numeric null,
  ebitda numeric null,
  adjusted_ebitda numeric null,
  ebitda_margin numeric null,
  industry text null,
  business_model text null,
  revenue_band text null,
  source_completeness_score numeric null,
  has_tax_returns boolean not null default false,
  has_financial_statements boolean not null default false,
  reconciliation_status text not null default 'unknown',
  addback_count integer not null default 0,
  addback_value numeric null,
  addback_types jsonb not null default '[]'::jsonb,
  risk_flags jsonb not null default '[]'::jsonb,
  blocker_count integer not null default 0,
  completion_percent numeric not null default 0,
  current_stage text not null default 'ingestion',
  is_snapshot_ready boolean not null default false,
  is_benchmark_eligible boolean not null default false,
  financials_confidence text not null default 'low',
  snapshot_reason text null,
  created_at timestamptz not null default now(),
  constraint deal_memory_completion_percent_check
    check (completion_percent between 0 and 100),
  constraint deal_memory_source_completeness_score_check
    check (
      source_completeness_score is null
      or source_completeness_score between 0 and 100
    ),
  constraint deal_memory_reconciliation_status_check
    check (
      reconciliation_status in ('balanced', 'partial', 'broken', 'unknown')
    ),
  constraint deal_memory_current_stage_check
    check (
      current_stage in ('ingestion', 'financials', 'underwriting', 'loi', 'closed')
    ),
  constraint deal_memory_financials_confidence_check
    check (financials_confidence in ('low', 'medium', 'high'))
);

create or replace function public.prevent_deal_memory_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'public.deal_memory is append-only; % is not allowed', tg_op;
end;
$$;

drop trigger if exists trg_deal_memory_prevent_update on public.deal_memory;
create trigger trg_deal_memory_prevent_update
  before update on public.deal_memory
  for each row
  execute function public.prevent_deal_memory_mutation();

drop trigger if exists trg_deal_memory_prevent_delete on public.deal_memory;
create trigger trg_deal_memory_prevent_delete
  before delete on public.deal_memory
  for each row
  execute function public.prevent_deal_memory_mutation();

create index if not exists idx_deal_memory_deal_id
  on public.deal_memory(deal_id);

create index if not exists idx_deal_memory_company_id
  on public.deal_memory(company_id);

create index if not exists idx_deal_memory_snapshot_at_desc
  on public.deal_memory(snapshot_at desc);

create index if not exists idx_deal_memory_industry
  on public.deal_memory(industry);

create index if not exists idx_deal_memory_reconciliation_status
  on public.deal_memory(reconciliation_status);

create index if not exists idx_deal_memory_is_benchmark_eligible
  on public.deal_memory(is_benchmark_eligible);

create index if not exists idx_deal_memory_latest_lookup
  on public.deal_memory(deal_id, snapshot_at desc, created_at desc, id desc);

create or replace view public.deal_memory_latest as
select distinct on (dm.deal_id)
  dm.id,
  dm.deal_id,
  dm.company_id,
  dm.snapshot_at,
  dm.revenue,
  dm.ebitda,
  dm.adjusted_ebitda,
  dm.ebitda_margin,
  dm.industry,
  dm.business_model,
  dm.revenue_band,
  dm.source_completeness_score,
  dm.has_tax_returns,
  dm.has_financial_statements,
  dm.reconciliation_status,
  dm.addback_count,
  dm.addback_value,
  dm.addback_types,
  dm.risk_flags,
  dm.blocker_count,
  dm.completion_percent,
  dm.current_stage,
  dm.is_snapshot_ready,
  dm.is_benchmark_eligible,
  dm.financials_confidence,
  dm.snapshot_reason,
  dm.created_at
from public.deal_memory dm
order by dm.deal_id, dm.snapshot_at desc, dm.created_at desc, dm.id desc;

alter table public.deal_memory enable row level security;
alter table public.deal_memory force row level security;

comment on table public.deal_memory is
  'Append-only historical underwriting snapshots per deal.';

comment on view public.deal_memory_latest is
  'Latest snapshot per deal_id from public.deal_memory.';

-- TODO: Replace these placeholders with real org/deal ownership policies once the
-- authorization model is finalized. With RLS enabled and no policies created yet,
-- table access is denied by default for non-bypass roles, which is production-safe.
--
-- Example policy skeleton:
-- create policy "Deal memory read access"
--   on public.deal_memory
--   for select
--   to authenticated
--   using (
--     -- TODO: scope rows to the caller's organization / deal access model
--     false
--   );
--
-- create policy "Deal memory insert access"
--   on public.deal_memory
--   for insert
--   to authenticated
--   with check (
--     -- TODO: scope inserts to the caller's organization / deal access model
--     false
--   );

commit;
