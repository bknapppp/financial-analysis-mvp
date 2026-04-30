alter table public.companies
  add column if not exists deal_name text;

alter table public.companies
  add column if not exists deal_type text;

alter table public.companies
  add column if not exists status text not null default 'New';

update public.companies
set deal_name = name
where deal_name is null;
