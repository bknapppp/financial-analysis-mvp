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
