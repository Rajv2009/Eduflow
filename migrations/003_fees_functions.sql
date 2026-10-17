-- =============================================================
-- Migration 003 (consolidated): audit_log + enrollment_fees view
--   + fee_total guard + add_payment / cancel_payment RPCs
-- Project: EduFlow OS | Environment: DEV first, then LIVE
-- Depends on: 001/001b (core tables, fn_block_delete), 002/002b (payments)
-- Rules: idempotent, non-destructive, remaining NEVER stored,
--        payments written ONLY through the RPCs, audit_log append-only
-- =============================================================

begin;

-- -------------------------------------------------------------
-- 1. audit_log (append-only)
-- -------------------------------------------------------------
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  table_name  text not null,
  record_id   uuid,
  action      text not null,
  old_value   jsonb,
  new_value   jsonb,
  changed_by  uuid references auth.users(id),
  changed_at  timestamptz not null default now()
);

create index if not exists audit_log_by_table_idx  on public.audit_log (table_name);
create index if not exists audit_log_by_record_idx on public.audit_log (record_id);

alter table public.audit_log enable row level security;

create or replace function public.fn_block_update()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'UPDATE is blocked on % - this table is append-only', tg_table_name
    using errcode = 'check_violation';
  return null;
end; $$;

drop trigger if exists trg_block_delete on public.audit_log;
create trigger trg_block_delete before delete on public.audit_log
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_truncate on public.audit_log;
create trigger trg_block_truncate before truncate on public.audit_log
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_update on public.audit_log
  before update on public.audit_log
  for each statement execute function public.fn_block_update();

revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

-- -------------------------------------------------------------
-- 2. enrollment_fees view: paid / remaining / status always calculated.
--    fee_total = 0 means 'not_set' (never 'paid').
-- -------------------------------------------------------------
create or replace view public.enrollment_fees with (security_invoker = true) as
select
  e.id as enrollment_id, s.id as student_id, s.full_name as student_name, s.student_code,
  c.id as class_id, c.name as class_name, b.id as batch_id, b.name as batch_name,
  e.fee_total, e.joined_on,
  coalesce(p.paid, 0) as paid,
  e.fee_total - coalesce(p.paid, 0) as remaining,
  case
    when e.fee_total = 0 then 'not_set'
    when coalesce(p.paid, 0) >= e.fee_total then 'paid'
    when coalesce(p.paid, 0) <= 0 then 'pending'
    else 'partial'
  end as fee_status
from public.enrollments e
join public.students s on s.id = e.student_id
join public.batches b on b.id = e.batch_id
join public.classes c on c.id = b.class_id
left join (
  select enrollment_id, sum(amount) as paid
  from public.payments
  where status = 'active'
  group by enrollment_id
) p on p.enrollment_id = e.id
where e.left_on is null and e.archived_at is null;

-- -------------------------------------------------------------
-- 3. fee_total guard: never below active payments; every change logged.
--    SECURITY DEFINER so the audit insert works under RLS.
-- -------------------------------------------------------------
create or replace function public.fn_fee_total_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_paid numeric(10,2);
begin
  if new.fee_total is distinct from old.fee_total then
    select coalesce(sum(amount), 0) into v_paid
      from public.payments where enrollment_id = new.id and status = 'active';
    if new.fee_total < v_paid then
      raise exception 'fee_total (%) cannot go below total active payments (%)',
        new.fee_total, v_paid using errcode = 'check_violation';
    end if;
    insert into public.audit_log (table_name, record_id, action, old_value, new_value, changed_by)
    values ('enrollments', new.id, 'fee_total_update',
      jsonb_build_object('fee_total', old.fee_total),
      jsonb_build_object('fee_total', new.fee_total), auth.uid());
  end if;
  return new;
end; $$;

drop trigger if exists trg_fee_total_guard on public.enrollments;
create trigger trg_fee_total_guard before update on public.enrollments
  for each row execute function public.fn_fee_total_guard();

-- -------------------------------------------------------------
-- 4. add_payment: the ONLY way to record a payment.
--    Row lock prevents double-click overpayment; IST date default;
--    idempotency key must match the original payment.
-- -------------------------------------------------------------
drop function if exists public.add_payment(uuid, numeric, text, date, text, text);
create function public.add_payment(
  p_enrollment_id uuid, p_amount numeric, p_mode text default 'cash',
  p_paid_on date default null, p_txn_ref text default null, p_idempotency_key text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_fee numeric(10,2); v_paid numeric(10,2); v_remaining numeric(10,2);
  v_id uuid; v_receipt text; v_existing public.payments;
begin
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

-- -------------------------------------------------------------
-- 5. cancel_payment: reason required, original row stays visible.
-- -------------------------------------------------------------
drop function if exists public.cancel_payment(uuid, text);
create function public.cancel_payment(p_payment_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_payment public.payments;
begin
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

revoke all on function public.add_payment(uuid, numeric, text, date, text, text) from public, anon;
grant execute on function public.add_payment(uuid, numeric, text, date, text, text) to authenticated;
revoke all on function public.cancel_payment(uuid, text) from public, anon;
grant execute on function public.cancel_payment(uuid, text) to authenticated;

-- -------------------------------------------------------------
-- 6. Backstop: no insert path can exceed the remaining fee.
--    Payments are writable ONLY through the RPCs above.
-- -------------------------------------------------------------
create or replace function public.fn_payment_overpay_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_fee numeric(10,2); v_paid numeric(10,2);
begin
  if new.status = 'active' then
    select fee_total into v_fee from public.enrollments where id = new.enrollment_id for update;
    select coalesce(sum(amount), 0) into v_paid from public.payments
     where enrollment_id = new.enrollment_id and status = 'active';
    if new.amount > v_fee - v_paid then
      raise exception 'Payment % exceeds remaining %', new.amount, v_fee - v_paid
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_payment_overpay_guard on public.payments;
create trigger trg_payment_overpay_guard before insert on public.payments
  for each row execute function public.fn_payment_overpay_guard();

revoke insert, update on public.payments from anon, authenticated;

commit;
