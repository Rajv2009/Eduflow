-- =============================================================
-- Migration 005: RLS policies (owner access, everyone else locked)
-- Project: EduFlow OS | Environment: DEV ONLY
-- Depends on: 001-004 (all tables exist, RLS enabled, no policies)
-- Rules: idempotent, non-destructive
--
-- Design decisions:
--   1. owner = authenticated user with a profiles row
--      (is_owner() is SECURITY DEFINER to avoid RLS recursion)
--   2. profiles bootstrap: a fresh auth user can select/insert
--      ONLY their own profile row (user_id = auth.uid()) so
--      the first login can create its own profile without deadlock
--   3. payments: SELECT only for owner. Insert/update happen
--      ONLY via add_payment / cancel_payment RPCs (SECURITY DEFINER)
--      so nobody can bypass the reason/guard rules by raw SQL
--   4. audit_log: SELECT + INSERT for owner, no UPDATE policy
--      (rows can be written but never tampered with)
--   5. No DELETE policies anywhere (RLS default deny + the
--      block-delete trigger from 001/002/003)
-- =============================================================

begin;

-- =============================================================
-- 1. is_owner(): true if current auth user has a profiles row
--    SECURITY DEFINER so it reads profiles WITHOUT re-entering
--    RLS (prevents infinite recursion on the profiles policies)
-- =============================================================
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid()
  );
$$;

-- =============================================================
-- 2. Helper to create policies idempotently
-- =============================================================

-- profiles: bootstrap + owner access
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.is_owner());

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- classes
drop policy if exists classes_owner_select on public.classes;
create policy classes_owner_select on public.classes
  for select to authenticated using (public.is_owner());
drop policy if exists classes_owner_insert on public.classes;
create policy classes_owner_insert on public.classes
  for insert to authenticated with check (public.is_owner());
drop policy if exists classes_owner_update on public.classes;
create policy classes_owner_update on public.classes
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- subjects
drop policy if exists subjects_owner_select on public.subjects;
create policy subjects_owner_select on public.subjects
  for select to authenticated using (public.is_owner());
drop policy if exists subjects_owner_insert on public.subjects;
create policy subjects_owner_insert on public.subjects
  for insert to authenticated with check (public.is_owner());
drop policy if exists subjects_owner_update on public.subjects;
create policy subjects_owner_update on public.subjects
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- batches
drop policy if exists batches_owner_select on public.batches;
create policy batches_owner_select on public.batches
  for select to authenticated using (public.is_owner());
drop policy if exists batches_owner_insert on public.batches;
create policy batches_owner_insert on public.batches
  for insert to authenticated with check (public.is_owner());
drop policy if exists batches_owner_update on public.batches;
create policy batches_owner_update on public.batches
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- batch_subjects
drop policy if exists batch_subjects_owner_select on public.batch_subjects;
create policy batch_subjects_owner_select on public.batch_subjects
  for select to authenticated using (public.is_owner());
drop policy if exists batch_subjects_owner_insert on public.batch_subjects;
create policy batch_subjects_owner_insert on public.batch_subjects
  for insert to authenticated with check (public.is_owner());
drop policy if exists batch_subjects_owner_update on public.batch_subjects;
create policy batch_subjects_owner_update on public.batch_subjects
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- students
drop policy if exists students_owner_select on public.students;
create policy students_owner_select on public.students
  for select to authenticated using (public.is_owner());
drop policy if exists students_owner_insert on public.students;
create policy students_owner_insert on public.students
  for insert to authenticated with check (public.is_owner());
drop policy if exists students_owner_update on public.students;
create policy students_owner_update on public.students
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- enrollments (fee_total edits go through the guard trigger)
drop policy if exists enrollments_owner_select on public.enrollments;
create policy enrollments_owner_select on public.enrollments
  for select to authenticated using (public.is_owner());
drop policy if exists enrollments_owner_insert on public.enrollments;
create policy enrollments_owner_insert on public.enrollments
  for insert to authenticated with check (public.is_owner());
drop policy if exists enrollments_owner_update on public.enrollments;
create policy enrollments_owner_update on public.enrollments
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- payments: SELECT ONLY for owner.
-- Insert/update happen ONLY inside add_payment / cancel_payment
-- (SECURITY DEFINER RPCs), so raw SQL can never bypass the guards.
drop policy if exists payments_owner_select on public.payments;
create policy payments_owner_select on public.payments
  for select to authenticated using (public.is_owner());
-- (intentionally NO insert/update policies on payments)

-- attendance (corrections = update, never delete)
drop policy if exists attendance_owner_select on public.attendance;
create policy attendance_owner_select on public.attendance
  for select to authenticated using (public.is_owner());
drop policy if exists attendance_owner_insert on public.attendance;
create policy attendance_owner_insert on public.attendance
  for insert to authenticated with check (public.is_owner());
drop policy if exists attendance_owner_update on public.attendance;
create policy attendance_owner_update on public.attendance
  for update to authenticated
  using (public.is_owner()) with check (public.is_owner());

-- audit_log: readable + writable by owner, but NO update policy,
-- so audit rows are written by triggers and can never be edited.
drop policy if exists audit_log_owner_select on public.audit_log;
create policy audit_log_owner_select on public.audit_log
  for select to authenticated using (public.is_owner());
drop policy if exists audit_log_owner_insert on public.audit_log;
create policy audit_log_owner_insert on public.audit_log
  for insert to authenticated with check (public.is_owner());
-- (intentionally NO update policy on audit_log)

commit;
