-- =============================================================
-- Migration 005 (final, as applied): RLS policies + owner checks
-- Project: EduFlow OS | Environment: DEV first, then LIVE
-- Depends on: 001-004
-- Rules: idempotent, non-destructive
--
-- Design:
--   * owner = logged-in user with a profiles row where role = 'owner'.
--     Owner rows are created ONLY by the developer (SQL), never by the app.
--     (No self-signup path to ownership: no insert/update policy on profiles.)
--   * owner: select + insert + update on core tables. No DELETE policy anywhere.
--   * payments and audit_log: owner can only READ. Writes happen only inside
--     add_payment / cancel_payment and the guard triggers (SECURITY DEFINER).
--   * add_payment / cancel_payment also verify the caller is the owner.
--   * anon: no access at all.
--
-- AFTER APPLYING (manual, once per environment, NOT part of this file):
--   insert the owner's profile for the admin auth user, e.g.
--   insert into public.profiles (user_id, full_name, role)
--   select id, split_part(email, '@', 1), 'owner' from auth.users where email = '<owner email>';
--   Also turn OFF "Allow new users to sign up" in Supabase Auth settings.
-- =============================================================

begin;

-- 1. is_owner()
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where user_id = auth.uid() and role = 'owner'
  );
$$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- 2. profiles: read own row only; no insert/update from the app
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

-- 3. Owner policies (select + insert + update, never delete)
drop policy if exists classes_owner_select on public.classes;
create policy classes_owner_select on public.classes for select to authenticated using ((select public.is_owner()));
drop policy if exists classes_owner_insert on public.classes;
create policy classes_owner_insert on public.classes for insert to authenticated with check ((select public.is_owner()));
drop policy if exists classes_owner_update on public.classes;
create policy classes_owner_update on public.classes for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists subjects_owner_select on public.subjects;
create policy subjects_owner_select on public.subjects for select to authenticated using ((select public.is_owner()));
drop policy if exists subjects_owner_insert on public.subjects;
create policy subjects_owner_insert on public.subjects for insert to authenticated with check ((select public.is_owner()));
drop policy if exists subjects_owner_update on public.subjects;
create policy subjects_owner_update on public.subjects for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists batches_owner_select on public.batches;
create policy batches_owner_select on public.batches for select to authenticated using ((select public.is_owner()));
drop policy if exists batches_owner_insert on public.batches;
create policy batches_owner_insert on public.batches for insert to authenticated with check ((select public.is_owner()));
drop policy if exists batches_owner_update on public.batches;
create policy batches_owner_update on public.batches for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists batch_subjects_owner_select on public.batch_subjects;
create policy batch_subjects_owner_select on public.batch_subjects for select to authenticated using ((select public.is_owner()));
drop policy if exists batch_subjects_owner_insert on public.batch_subjects;
create policy batch_subjects_owner_insert on public.batch_subjects for insert to authenticated with check ((select public.is_owner()));
drop policy if exists batch_subjects_owner_update on public.batch_subjects;
create policy batch_subjects_owner_update on public.batch_subjects for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists students_owner_select on public.students;
create policy students_owner_select on public.students for select to authenticated using ((select public.is_owner()));
drop policy if exists students_owner_insert on public.students;
create policy students_owner_insert on public.students for insert to authenticated with check ((select public.is_owner()));
drop policy if exists students_owner_update on public.students;
create policy students_owner_update on public.students for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists enrollments_owner_select on public.enrollments;
create policy enrollments_owner_select on public.enrollments for select to authenticated using ((select public.is_owner()));
drop policy if exists enrollments_owner_insert on public.enrollments;
create policy enrollments_owner_insert on public.enrollments for insert to authenticated with check ((select public.is_owner()));
drop policy if exists enrollments_owner_update on public.enrollments;
create policy enrollments_owner_update on public.enrollments for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

drop policy if exists attendance_owner_select on public.attendance;
create policy attendance_owner_select on public.attendance for select to authenticated using ((select public.is_owner()));
drop policy if exists attendance_owner_insert on public.attendance;
create policy attendance_owner_insert on public.attendance for insert to authenticated with check ((select public.is_owner()));
drop policy if exists attendance_owner_update on public.attendance;
create policy attendance_owner_update on public.attendance for update to authenticated
  using ((select public.is_owner())) with check ((select public.is_owner()));

-- 4. payments and audit_log: READ ONLY for the owner
drop policy if exists payments_owner_select on public.payments;
create policy payments_owner_select on public.payments for select to authenticated using ((select public.is_owner()));
drop policy if exists audit_log_owner_select on public.audit_log;
create policy audit_log_owner_select on public.audit_log for select to authenticated using ((select public.is_owner()));
drop policy if exists audit_log_owner_insert on public.audit_log;

-- 5. Payment RPCs (SECURITY DEFINER) verify the caller is the owner
create or replace function public.add_payment(
  p_enrollment_id uuid, p_amount numeric, p_mode text default 'cash',
  p_paid_on date default null, p_txn_ref text default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_fee numeric(10,2); v_paid numeric(10,2); v_remaining numeric(10,2);
  v_id uuid; v_receipt text; v_existing public.payments;
begin
  if not public.is_owner() then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing from public.payments where idempotency_key = p_idempotency_key;
    if found then
      if v_existing.enrollment_id <> p_enrollment_id or v_existing.amount <> p_amount then
        raise exception 'Idempotency key was already used for a different payment'
          using errcode = 'check_violation';
      end if;
      return jsonb_build_object('ok', true, 'duplicate', true,
        'payment_id', v_existing.id, 'receipt_no', v_existing.receipt_no);
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than 0' using errcode = 'check_violation';
  end if;

  select fee_total into v_fee from public.enrollments
   where id = p_enrollment_id and left_on is null and archived_at is null
   for update;
  if not found then
    raise exception 'Active enrollment not found' using errcode = 'foreign_key_violation';
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.payments
   where enrollment_id = p_enrollment_id and status = 'active';
  v_remaining := v_fee - v_paid;
  if p_amount > v_remaining then
    raise exception 'Amount % exceeds remaining %', p_amount, v_remaining
      using errcode = 'check_violation';
  end if;

  insert into public.payments (enrollment_id, amount, mode, paid_on, txn_ref, idempotency_key, created_by)
  values (p_enrollment_id, p_amount, p_mode,
          coalesce(p_paid_on, (now() at time zone 'Asia/Kolkata')::date),
          p_txn_ref, p_idempotency_key, auth.uid())
  returning id, receipt_no into v_id, v_receipt;

  return jsonb_build_object('ok', true, 'duplicate', false, 'payment_id', v_id, 'receipt_no', v_receipt);
end; $$;

create or replace function public.cancel_payment(p_payment_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payment public.payments;
begin
  if not public.is_owner() then
    raise exception 'Not allowed' using errcode = 'insufficient_privilege';
  end if;
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A cancel reason of at least 3 characters is required'
      using errcode = 'check_violation';
  end if;
  select * into v_payment from public.payments
   where id = p_payment_id and status = 'active' for update;
  if not found then
    raise exception 'Active payment not found (already cancelled?)'
      using errcode = 'foreign_key_violation';
  end if;
  update public.payments set status = 'cancelled', cancelled_reason = trim(p_reason),
         cancelled_by = auth.uid(), cancelled_at = now()
   where id = p_payment_id;
  insert into public.audit_log (table_name, record_id, action, old_value, new_value, changed_by)
  values ('payments', p_payment_id, 'cancel_payment',
    jsonb_build_object('status', 'active', 'amount', v_payment.amount),
    jsonb_build_object('status', 'cancelled', 'reason', trim(p_reason)), auth.uid());
  return jsonb_build_object('ok', true, 'payment_id', p_payment_id);
end; $$;

-- 6. Trigger/helper functions must never be callable from the API
revoke all on function public.fn_attendance_guard()      from public, anon, authenticated;
revoke all on function public.fn_fee_total_guard()       from public, anon, authenticated;
revoke all on function public.fn_payment_overpay_guard() from public, anon, authenticated;
revoke all on function public.fn_block_delete()          from public, anon, authenticated;
revoke all on function public.fn_block_update()          from public, anon, authenticated;
revoke all on function public.fn_set_receipt_no()        from public, anon, authenticated;
revoke all on function public.fn_payments_immutable()    from public, anon, authenticated;

commit;
