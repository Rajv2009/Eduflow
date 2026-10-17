-- =============================================================
-- Migration 001b (as applied): stronger delete protection
-- Statement-level DELETE trigger (fires even on empty tables) + TRUNCATE block
-- =============================================================

begin;

alter function public.fn_block_delete() set search_path = '';

drop trigger if exists trg_block_delete on public.classes;
create trigger trg_block_delete before delete on public.classes
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_delete on public.subjects;
create trigger trg_block_delete before delete on public.subjects
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_delete on public.batches;
create trigger trg_block_delete before delete on public.batches
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_delete on public.batch_subjects;
create trigger trg_block_delete before delete on public.batch_subjects
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_delete on public.students;
create trigger trg_block_delete before delete on public.students
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_delete on public.enrollments;
create trigger trg_block_delete before delete on public.enrollments
  for each statement execute function public.fn_block_delete();

drop trigger if exists trg_block_truncate on public.classes;
create trigger trg_block_truncate before truncate on public.classes
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_truncate on public.subjects;
create trigger trg_block_truncate before truncate on public.subjects
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_truncate on public.batches;
create trigger trg_block_truncate before truncate on public.batches
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_truncate on public.batch_subjects;
create trigger trg_block_truncate before truncate on public.batch_subjects
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_truncate on public.students;
create trigger trg_block_truncate before truncate on public.students
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_truncate on public.enrollments;
create trigger trg_block_truncate before truncate on public.enrollments
  for each statement execute function public.fn_block_delete();

revoke truncate on public.profiles, public.classes, public.subjects,
  public.batches, public.batch_subjects, public.students, public.enrollments
  from anon, authenticated;

commit;
