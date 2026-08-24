begin;

create table if not exists public.deal_phases (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  phase_key text not null check (phase_key in ('planning','information_request','data_review','findings','reporting','close')),
  status text not null default 'not_started' check (status in ('not_started','in_progress','awaiting_review','changes_requested','blocked','complete')),
  submitted_by_user_id uuid references auth.users(id) on delete set null,
  submitted_by_name text,
  submitted_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  reviewer_decision text check (reviewer_decision is null or reviewer_decision in ('approved','changes_requested')),
  reviewer_rationale text,
  reopened_at timestamptz,
  completion_basis jsonb,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, phase_key),
  constraint deal_phases_complete_review_check check (status <> 'complete' or reviewer_decision = 'approved')
);

create table if not exists public.analysis_procedures (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.deal_phases(id) on delete cascade,
  procedure_key text not null,
  template_version text not null,
  workstream_key text not null,
  title text not null,
  required boolean not null default true,
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_name text,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewer_name text,
  status text not null default 'not_started' check (status in ('not_started','in_progress','ready_for_review','complete','blocked')),
  due_date date,
  result_summary text,
  started_at timestamptz,
  completed_at timestamptz,
  completed_by_user_id uuid references auth.users(id) on delete set null,
  completed_by_name text,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phase_id, procedure_key),
  constraint analysis_procedures_complete_check check (status <> 'complete' or completed_at is not null)
);

create table if not exists public.analysis_investigations (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.deal_phases(id) on delete cascade,
  procedure_id uuid references public.analysis_procedures(id) on delete set null,
  reference_code text not null,
  title text not null,
  signal_type text not null check (signal_type in ('manual','mapping_exception','reconciliation_exception','data_quality','document_gap','add_back','financial_variance','system_issue','other')),
  signal_key text,
  signal_summary text not null,
  signal_snapshot jsonb,
  period_id uuid references public.reporting_periods(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  owner_name text,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewer_name text,
  priority text not null check (priority in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','ready_for_review','closed')),
  notes text,
  conclusion text,
  disposition text check (disposition is null or disposition in ('resolved','immaterial','adjustment_proposed','further_support_required','promote_to_finding')),
  materiality_rationale text,
  promoted_issue_id uuid references public.diligence_issues(id) on delete set null,
  opened_by_user_id uuid references auth.users(id) on delete set null,
  opened_by_name text not null,
  opened_at timestamptz not null default now(),
  resolved_by_user_id uuid references auth.users(id) on delete set null,
  resolved_by_name text,
  resolved_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phase_id, reference_code),
  constraint analysis_investigations_closed_check check (
    status <> 'closed' or (nullif(trim(conclusion), '') is not null and disposition is not null and resolved_at is not null)
  )
);

create table if not exists public.investigation_evidence (
  id uuid primary key default gen_random_uuid(),
  investigation_id uuid not null references public.analysis_investigations(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('source_document','document_version','reporting_period','financial_entry','source_financial_entry','account_mapping','add_back','diligence_issue')),
  evidence_id uuid not null,
  relationship text not null default 'supports' check (relationship in ('source','supports','contradicts','related','result')),
  label_snapshot text,
  attached_by_user_id uuid references auth.users(id) on delete set null,
  attached_by_name text not null,
  created_at timestamptz not null default now(),
  unique (investigation_id, evidence_type, evidence_id, relationship)
);

create table if not exists public.phase_activity (
  id uuid primary key default gen_random_uuid(),
  phase_id uuid not null references public.deal_phases(id) on delete cascade,
  subject_type text not null check (subject_type in ('phase','procedure','investigation','evidence','finding')),
  subject_id uuid,
  event_type text not null check (event_type in ('phase_initialized','procedure_status_changed','procedure_assignment_changed','investigation_opened','investigation_updated','investigation_assignment_changed','investigation_dispositioned','investigation_waiver_approved','investigation_waiver_revoked','evidence_attached','evidence_detached','finding_promoted','review_comment_added','phase_submitted','changes_requested','phase_approved','phase_reopened')),
  from_state text,
  to_state text,
  rationale text,
  comment_text text,
  metadata jsonb,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_deal_phases_company_status on public.deal_phases(company_id, status);
create index if not exists idx_analysis_procedures_phase_status on public.analysis_procedures(phase_id, status);
create index if not exists idx_analysis_procedures_owner_status on public.analysis_procedures(owner_user_id, status);
create index if not exists idx_analysis_investigations_phase_status_priority on public.analysis_investigations(phase_id, status, priority);
create index if not exists idx_analysis_investigations_procedure_status on public.analysis_investigations(procedure_id, status);
create index if not exists idx_analysis_investigations_promoted_issue on public.analysis_investigations(promoted_issue_id);
create unique index if not exists idx_analysis_investigations_unique_promoted_issue on public.analysis_investigations(promoted_issue_id) where promoted_issue_id is not null;
create unique index if not exists idx_analysis_investigations_signal_dedupe on public.analysis_investigations(phase_id, signal_type, signal_key) where signal_key is not null;
create index if not exists idx_investigation_evidence_investigation on public.investigation_evidence(investigation_id);
create index if not exists idx_investigation_evidence_target on public.investigation_evidence(evidence_type, evidence_id);
create index if not exists idx_phase_activity_phase_created on public.phase_activity(phase_id, created_at desc);
create index if not exists idx_phase_activity_subject_created on public.phase_activity(subject_type, subject_id, created_at desc);
create index if not exists idx_phase_activity_event_created on public.phase_activity(event_type, created_at desc);

alter table public.deal_phases enable row level security;
alter table public.analysis_procedures enable row level security;
alter table public.analysis_investigations enable row level security;
alter table public.investigation_evidence enable row level security;
alter table public.phase_activity enable row level security;

create or replace function public.initialize_phase3(
  p_company_id uuid,
  p_actor_name text,
  p_procedures jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phase_id uuid;
begin
  if nullif(trim(p_actor_name), '') is null then raise exception 'actor is required'; end if;
  if not exists (select 1 from public.companies where id = p_company_id) then raise exception 'company not found'; end if;
  insert into public.deal_phases(company_id, phase_key, status)
  values (p_company_id, 'data_review', 'in_progress')
  on conflict (company_id, phase_key) do nothing;
  select id into v_phase_id from public.deal_phases where company_id = p_company_id and phase_key = 'data_review';
  insert into public.analysis_procedures(phase_id, procedure_key, template_version, workstream_key, title, required)
  select v_phase_id, x.procedure_key, x.template_version, x.workstream_key, x.title, x.required
  from jsonb_to_recordset(p_procedures) as x(procedure_key text, template_version text, workstream_key text, title text, required boolean)
  on conflict (phase_id, procedure_key) do nothing;
  if not exists (select 1 from public.phase_activity where phase_id = v_phase_id and event_type = 'phase_initialized') then
    insert into public.phase_activity(phase_id, subject_type, subject_id, event_type, actor_name)
    values (v_phase_id, 'phase', v_phase_id, 'phase_initialized', p_actor_name);
  end if;
  return v_phase_id;
end;
$$;

create or replace function public.create_phase3_investigation(
  p_phase_id uuid, p_procedure_id uuid, p_title text, p_signal_type text,
  p_signal_key text, p_signal_summary text, p_signal_snapshot jsonb, p_period_id uuid,
  p_owner_name text, p_reviewer_name text, p_priority text, p_actor_name text
) returns public.analysis_investigations
language plpgsql security definer set search_path = public as $$
declare v_next integer; v_row public.analysis_investigations;
begin
  perform 1 from public.deal_phases where id = p_phase_id and phase_key = 'data_review' for update;
  if not found then raise exception 'phase not found'; end if;
  select coalesce(max(substring(reference_code from 5)::integer), 0) + 1 into v_next
  from public.analysis_investigations where phase_id = p_phase_id and reference_code ~ '^INV-[0-9]+$';
  insert into public.analysis_investigations(
    phase_id, procedure_id, reference_code, title, signal_type, signal_key, signal_summary,
    signal_snapshot, period_id, owner_name, reviewer_name, priority, opened_by_name
  ) values (
    p_phase_id, p_procedure_id, 'INV-' || lpad(v_next::text, 3, '0'), trim(p_title), p_signal_type,
    nullif(trim(p_signal_key), ''), trim(p_signal_summary), p_signal_snapshot, p_period_id,
    nullif(trim(p_owner_name), ''), nullif(trim(p_reviewer_name), ''), p_priority, p_actor_name
  ) returning * into v_row;
  insert into public.phase_activity(phase_id, subject_type, subject_id, event_type, to_state, actor_name)
  values (p_phase_id, 'investigation', v_row.id, 'investigation_opened', 'open', p_actor_name);
  return v_row;
end;
$$;

create or replace function public.promote_phase3_investigation(
  p_company_id uuid, p_investigation_id uuid, p_expected_version integer,
  p_category text, p_severity text, p_actor_name text
) returns table(issue_id uuid, already_promoted boolean)
language plpgsql security definer set search_path = public as $$
declare v_inv public.analysis_investigations; v_issue uuid;
begin
  select i.* into v_inv from public.analysis_investigations i
  join public.deal_phases p on p.id = i.phase_id
  where i.id = p_investigation_id and p.company_id = p_company_id and p.phase_key = 'data_review'
  for update of i;
  if not found then raise exception 'investigation not found'; end if;
  if v_inv.promoted_issue_id is not null then return query select v_inv.promoted_issue_id, true; return; end if;
  if v_inv.version <> p_expected_version then raise exception 'stale version' using errcode = '40001'; end if;
  if nullif(trim(v_inv.conclusion), '') is null then raise exception 'conclusion is required'; end if;
  if not exists (select 1 from public.investigation_evidence where investigation_id = v_inv.id) then raise exception 'evidence is required'; end if;
  insert into public.diligence_issues(company_id, period_id, source_type, issue_code, title, description, category, severity, status, linked_page, linked_field, linked_route, dedupe_key, created_by, owner)
  values (p_company_id, v_inv.period_id, 'manual', null, v_inv.title, v_inv.signal_summary || E'\n\nAnalyst conclusion: ' || v_inv.conclusion, p_category, p_severity, 'open', 'overview', 'phase3-investigation', '/deal/' || p_company_id || '/phases/data-review?investigation=' || v_inv.id, null, p_actor_name, v_inv.owner_name)
  returning id into v_issue;
  update public.analysis_investigations set disposition = 'promote_to_finding', status = 'closed', promoted_issue_id = v_issue,
    resolved_at = now(), resolved_by_name = p_actor_name, version = version + 1, updated_at = now()
  where id = v_inv.id;
  insert into public.phase_activity(phase_id, subject_type, subject_id, event_type, from_state, to_state, metadata, actor_name)
  values (v_inv.phase_id, 'finding', v_issue, 'finding_promoted', v_inv.status, 'closed', jsonb_build_object('investigationId', v_inv.id, 'issueId', v_issue), p_actor_name);
  return query select v_issue, false;
end;
$$;

revoke all on function public.initialize_phase3(uuid, text, jsonb) from public, anon, authenticated;
revoke all on function public.create_phase3_investigation(uuid, uuid, text, text, text, text, jsonb, uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.promote_phase3_investigation(uuid, uuid, integer, text, text, text) from public, anon, authenticated;

commit;
