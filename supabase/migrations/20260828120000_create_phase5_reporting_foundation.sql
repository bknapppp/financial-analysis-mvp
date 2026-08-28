begin;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  phase_id uuid not null unique references public.deal_phases(id) on delete cascade,
  title text not null,
  report_type text not null default 'financial_diligence' check (report_type = 'financial_diligence'),
  template_key text not null default 'broadstone_phase5_v1' check (template_key = 'broadstone_phase5_v1'),
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_name text,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewer_name text,
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_name text not null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_name text not null,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reports_title_required check (nullif(trim(title), '') is not null)
);

create table if not exists public.report_sections (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  section_key text not null check (section_key in (
    'executive_summary','qoe_ebitda_bridge','financial_analysis','findings_summary',
    'deal_implications','recommendations','limitations_appendices'
  )),
  title text not null,
  sort_order integer not null check (sort_order between 1 and 7),
  status text not null default 'not_started' check (status in ('not_started','in_progress','complete')),
  narrative text,
  completion_basis text check (completion_basis is null or completion_basis in ('narrative','authoritative','unavailable')),
  unavailable_reason text,
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_name text,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewer_name text,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_name text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(report_id, section_key),
  unique(report_id, sort_order),
  constraint report_sections_title_required check (nullif(trim(title), '') is not null),
  constraint report_sections_completion_shape check (
    status <> 'complete' or (
      (completion_basis = 'narrative' and nullif(trim(narrative), '') is not null)
      or completion_basis = 'authoritative'
      or (completion_basis = 'unavailable' and nullif(trim(unavailable_reason), '') is not null)
    )
  )
);

create table if not exists public.report_section_findings (
  report_section_id uuid not null references public.report_sections(id) on delete cascade,
  issue_id uuid not null references public.finding_profiles(issue_id) on delete cascade,
  sort_order integer not null default 1 check (sort_order > 0),
  expected_approved_version integer not null check (expected_approved_version > 0),
  linked_by_user_id uuid references auth.users(id) on delete set null,
  linked_by_name text not null,
  created_at timestamptz not null default now(),
  primary key(report_section_id, issue_id)
);

create index if not exists idx_reports_company on public.reports(company_id);
create index if not exists idx_report_sections_report_status on public.report_sections(report_id,status);
create index if not exists idx_report_section_findings_issue on public.report_section_findings(issue_id);

alter table public.reports enable row level security;
alter table public.report_sections enable row level security;
alter table public.report_section_findings enable row level security;

alter table public.phase_activity drop constraint if exists phase_activity_subject_type_check;
alter table public.phase_activity add constraint phase_activity_subject_type_check check (subject_type in (
  'phase','procedure','investigation','evidence','finding','report','report_section'
));

alter table public.phase_activity drop constraint if exists phase_activity_event_type_check;
alter table public.phase_activity add constraint phase_activity_event_type_check check (event_type in (
  'phase_initialized','procedure_status_changed','procedure_assignment_changed','investigation_opened','investigation_updated','investigation_assignment_changed','investigation_dispositioned','investigation_waiver_approved','investigation_waiver_revoked','evidence_attached','evidence_detached','finding_promoted','review_comment_added','phase_submitted','changes_requested','phase_approved','phase_reopened',
  'finding_admitted','manual_finding_created','finding_updated','finding_assignment_changed','finding_materiality_changed','finding_impact_updated','finding_evidence_linked','finding_evidence_unlinked','finding_investigation_linked','finding_investigation_unlinked','finding_add_back_linked','finding_add_back_unlinked','management_response_requested','management_response_recorded','management_response_evaluated','management_response_waived','management_response_reinstated','finding_recommendation_updated','finding_reporting_treatment_changed','finding_submitted','finding_changes_requested','finding_approved','finding_reopened',
  'reporting_initialized','report_section_updated','report_finding_linked','report_finding_unlinked'
));

create or replace function public.phase5_validate_report_scope() returns trigger
language plpgsql set search_path=public as $$
declare v_company uuid; v_key text;
begin
  select company_id,phase_key into v_company,v_key from public.deal_phases where id=new.phase_id;
  if v_company is null or v_key <> 'reporting' or v_company <> new.company_id then
    raise exception 'Report phase belongs to another deal or is not Reporting';
  end if;
  return new;
end $$;

create or replace function public.phase5_validate_finding_link_scope() returns trigger
language plpgsql set search_path=public as $$
declare v_report_company uuid; v_finding_company uuid; v_phase_status text; v_profile public.finding_profiles;
begin
  select r.company_id into v_report_company
  from public.report_sections s join public.reports r on r.id=s.report_id
  where s.id=new.report_section_id;
  select d.company_id into v_finding_company from public.diligence_issues d where d.id=new.issue_id;
  select * into v_profile from public.finding_profiles where issue_id=new.issue_id;
  select p.status into v_phase_status from public.deal_phases p where p.id=v_profile.phase_id and p.phase_key='findings';
  if v_report_company is null or v_finding_company is null or v_report_company <> v_finding_company then
    raise exception 'Report finding belongs to another deal';
  end if;
  if v_phase_status <> 'complete' or v_profile.review_status <> 'approved'
    or v_profile.approved_version is null or v_profile.approved_version <> v_profile.version
    or v_profile.approved_version <> new.expected_approved_version
    or v_profile.reporting_treatment not in ('report_observation','key_finding')
    or nullif(trim(v_profile.approved_report_language),'') is null then
    raise exception 'Finding is not a current approved reporting finding';
  end if;
  return new;
end $$;

drop trigger if exists trg_phase5_report_scope on public.reports;
create trigger trg_phase5_report_scope before insert or update on public.reports
for each row execute function public.phase5_validate_report_scope();

drop trigger if exists trg_phase5_finding_link_scope on public.report_section_findings;
create trigger trg_phase5_finding_link_scope before insert or update on public.report_section_findings
for each row execute function public.phase5_validate_finding_link_scope();

create or replace function public.initialize_phase5_reporting(p_company_id uuid,p_actor_name text) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_phase_id uuid; v_report_id uuid;
begin
  if nullif(trim(p_actor_name),'') is null then raise exception 'actor is required'; end if;
  if not exists(select 1 from public.companies where id=p_company_id) then raise exception 'company not found'; end if;
  insert into public.deal_phases(company_id,phase_key,status)
  values(p_company_id,'reporting','in_progress') on conflict(company_id,phase_key) do nothing;
  select id into v_phase_id from public.deal_phases where company_id=p_company_id and phase_key='reporting';
  insert into public.reports(company_id,phase_id,title,created_by_name,updated_by_name)
  values(p_company_id,v_phase_id,'Financial Due Diligence Report',p_actor_name,p_actor_name)
  on conflict(phase_id) do nothing;
  select id into v_report_id from public.reports where phase_id=v_phase_id;
  insert into public.report_sections(report_id,section_key,title,sort_order)
  values
    (v_report_id,'executive_summary','Executive Summary',1),
    (v_report_id,'qoe_ebitda_bridge','Quality of Earnings / EBITDA Bridge',2),
    (v_report_id,'financial_analysis','Financial Analysis',3),
    (v_report_id,'findings_summary','Findings Summary',4),
    (v_report_id,'deal_implications','Deal Implications',5),
    (v_report_id,'recommendations','Recommendations',6),
    (v_report_id,'limitations_appendices','Limitations and Appendices',7)
  on conflict(report_id,section_key) do nothing;
  if not exists(select 1 from public.phase_activity where phase_id=v_phase_id and event_type='reporting_initialized') then
    insert into public.phase_activity(phase_id,subject_type,subject_id,event_type,actor_name,metadata)
    values(v_phase_id,'report',v_report_id,'reporting_initialized',p_actor_name,jsonb_build_object('reportId',v_report_id));
  end if;
  return v_report_id;
end $$;

revoke all on function public.initialize_phase5_reporting(uuid,text) from public,anon,authenticated;

commit;
