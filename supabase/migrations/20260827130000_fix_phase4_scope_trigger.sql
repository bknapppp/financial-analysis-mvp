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
