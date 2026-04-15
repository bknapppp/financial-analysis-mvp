begin;

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
set
  normalized_label = coalesce(normalized_label, account_name_key),
  usage_count = coalesce(usage_count, 0)
where normalized_label is null
   or usage_count is null;

alter table public.account_mappings
  alter column normalized_label set not null;

drop index if exists public.account_mappings_company_id_account_name_key_key;
drop index if exists public.idx_account_mappings_company_generic_unique;
drop index if exists public.idx_account_mappings_company_source_unique;
drop index if exists public.idx_account_mappings_shared_generic_unique;
drop index if exists public.idx_account_mappings_shared_source_unique;
drop index if exists public.idx_account_mappings_company_lookup;
drop index if exists public.idx_account_mappings_shared_lookup;

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

commit;
