begin;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'deal_stage'
  ) then
    create type deal_stage as enum (
      'new',
      'screening',
      'diligence',
      'ic_ready',
      'closing',
      'closed',
      'dead'
    );
  end if;
end
$$;

alter table public.companies
  add column if not exists stage deal_stage not null default 'new';

alter table public.companies
  add column if not exists stage_updated_at timestamptz not null default now();

alter table public.companies
  add column if not exists stage_notes text;

update public.companies
set
  stage = coalesce(stage, 'new'::deal_stage),
  stage_updated_at = coalesce(stage_updated_at, created_at, now())
where stage is null or stage_updated_at is null;

create index if not exists idx_companies_stage
  on public.companies(stage);

commit;
