-- =============================================================
-- Migration 006 (final, as applied): generic audit triggers + profile protections
-- Project: EduFlow OS | Environment: DEV first, then LIVE
-- Depends on: 003 (audit_log), 005 (policies)
-- Rules: idempotent, non-destructive
-- =============================================================

begin;

-- 1. Generic audit function: logs INSERT and UPDATE (old/new row, who, when).
--    SECURITY DEFINER so it can write audit_log (the owner has no insert on it).
create or replace function public.fn_audit_log()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (table_name, record_id, action, old_value, new_value, changed_by)
  values (
    tg_table_name,
    coalesce(new.id, old.id),
    lower(tg_op) || ':' || tg_table_name,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new),
    auth.uid()
  );
  return null;
end; $$;

revoke all on function public.fn_audit_log() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'classes','subjects','batches','batch_subjects',
    'students','enrollments','payments','attendance'
  ]
  loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format(
      'create trigger trg_audit after insert or update on public.%I
       for each row execute function public.fn_audit_log()', t);
  end loop;
end $$;

-- 2. profiles: delete and truncate blocked (statement-level, works on any row count)
revoke delete, truncate on public.profiles from anon, authenticated;
drop trigger if exists trg_block_delete on public.profiles;
create trigger trg_block_delete before delete on public.profiles
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_truncate on public.profiles;
create trigger trg_block_truncate before truncate on public.profiles
  for each statement execute function public.fn_block_delete();

-- 3. profiles.full_name can never be empty
alter table public.profiles drop constraint if exists profiles_full_name_nonempty;
alter table public.profiles add constraint profiles_full_name_nonempty
  check (length(trim(full_name)) > 0);

-- 4. Future tables/views must not be open to anon by default; fix what exists now
alter default privileges in schema public revoke all on tables from anon;
revoke all on all tables in schema public from anon;

commit;
