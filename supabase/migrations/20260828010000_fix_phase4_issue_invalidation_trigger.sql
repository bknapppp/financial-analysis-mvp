begin;

drop trigger if exists trg_phase4_issue_phase_reopen on public.diligence_issues;
create trigger trg_phase4_issue_phase_reopen
after update of title,description,category,severity,status on public.diligence_issues
for each row
when (
  old.title is distinct from new.title or
  old.description is distinct from new.description or
  old.category is distinct from new.category or
  old.severity is distinct from new.severity or
  old.status is distinct from new.status
)
execute function public.phase4_invalidate_issue_change();

commit;
