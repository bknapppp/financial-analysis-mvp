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
