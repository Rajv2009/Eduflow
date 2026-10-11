-- =============================================================
-- Migration 006: generic audit triggers + profiles fixes
-- Project: EduFlow OS | Environment: DEV ONLY
-- Depends on: 003 (audit_log table), 005 (policies)
-- Rules: idempotent, non-destructive
-- =============================================================

begin;

-- =============================================================
-- 1. Generic audit function: logs INSERT and UPDATE with
--    old/new row as jsonb, action, who (auth.uid()), when
--    (DELETE attempts are already blocked by fn_block_delete)
-- =============================================================
create or replace function public.fn_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_log (table_name, record_id, action,
                               old_value, new_value, changed_by)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op) || ':' || tg_table_name,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    auth.uid()
  );
  return null;  -- AFTER trigger
end;
$$;

-- Attach AFTER INSERT OR UPDATE audit trigger to core tables
do $$
declare
  t text;
begin
  foreach t in array array[
    'classes','subjects','batches','batch_subjects',
    'students','enrollments','payments','attendance'
  ]
  loop
    execute format(
      'drop trigger if exists trg_audit on public.%I', t);
    execute format(
      'create trigger trg_audit after insert or update on public.%I
       for each row execute function public.fn_audit_log()', t);
  end loop;
end;
$$;

-- =============================================================
-- 2. Fix A: profiles pe bhi delete-block trigger
--    (auth user delete hone par orphan profile na rahe)
-- =============================================================
revoke delete on public.profiles from anon, authenticated;

drop trigger if exists trg_block_delete on public.profiles;
create trigger trg_block_delete
  before delete on public.profiles
  for each row execute function public.fn_block_delete();

-- =============================================================
-- 3. Fix B: full_name kabhi khaali string nahi ho sake
-- =============================================================
alter table public.profiles
  drop constraint if exists profiles_full_name_nonempty;
alter table public.profiles
  add constraint profiles_full_name_nonempty
  check (length(trim(full_name)) > 0);

commit;
