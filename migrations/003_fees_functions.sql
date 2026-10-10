-- =============================================================
-- Migration 003: fees functions + fee_total guard + audit_log
-- Project: EduFlow OS | Environment: DEV ONLY
-- Depends on: 001 (enrollments), 002 (payments)
-- Rules: idempotent, non-destructive, remaining NEVER stored
-- =============================================================

begin;

-- =============================================================
-- 1. audit_log (moved forward from 006: fee_total changes must
--    be logged NOW; 006 adds generic triggers for other tables)
-- =============================================================
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

create index if not exists audit_log_by_table_idx
  on public.audit_log (table_name);
create index if not exists audit_log_by_record_idx
  on public.audit_log (record_id);

alter table public.audit_log enable row level security;
revoke delete on public.audit_log from anon, authenticated;

drop trigger if exists trg_block_delete on public.audit_log;
create trigger trg_block_delete
  before delete on public.audit_log
  for each row execute function public.fn_block_delete();

-- =============================================================
-- 2. enrollment_fees view: single source of fee truth.
--    paid / remaining / status are ALWAYS calculated.
--    security_invoker = underlying RLS applies to view reads.
-- =============================================================
create or replace view public.enrollment_fees
with (security_invoker = true) as
select
  e.id        as enrollment_id,
  s.id        as student_id,
  s.full_name as student_name,
  s.student_code,
  c.id        as class_id,
  c.name      as class_name,
  b.id        as batch_id,
  b.name      as batch_name,
  e.fee_total,
  e.joined_on,
  coalesce(p.paid, 0) as paid,
  e.fee_total - coalesce(p.paid, 0) as remaining,
  case
    when e.fee_total = 0 or coalesce(p.paid, 0) >= e.fee_total then 'paid'
    when coalesce(p.paid, 0) <= 0 then 'pending'
    else 'partial'
  end as fee_status
from public.enrollments e
join public.students s on s.id = e.student_id
join public.batches b   on b.id = e.batch_id
join public.classes c   on c.id = b.class_id
left join (
  select enrollment_id, sum(amount) as paid
  from public.payments
  where status = 'active'
  group by enrollment_id
) p on p.enrollment_id = e.id
where e.left_on is null
  and e.archived_at is null;

-- =============================================================
-- 3. fee_total guard (BEFORE UPDATE on enrollments):
--    - fee_total never below sum of active payments
--    - every change logged in audit_log (old, new, who, when)
-- =============================================================
create or replace function public.fn_fee_total_guard()
returns trigger
language plpgsql
as $$
declare
  v_paid numeric(10,2);
begin
  if new.fee_total is distinct from old.fee_total then
    select coalesce(sum(amount), 0) into v_paid
      from public.payments
     where enrollment_id = new.id
       and status = 'active';

    if new.fee_total < v_paid then
      raise exception 'fee_total (%) cannot go below total active payments (%)',
        new.fee_total, v_paid
        using errcode = 'check_violation';
    end if;

    insert into public.audit_log (table_name, record_id, action,
                                  old_value, new_value, changed_by)
    values ('enrollments', new.id, 'fee_total_update',
      jsonb_build_object('fee_total', old.fee_total),
      jsonb_build_object('fee_total', new.fee_total),
      auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fee_total_guard on public.enrollments;
create trigger trg_fee_total_guard
  before update on public.enrollments
  for each row execute function public.fn_fee_total_guard();

-- =============================================================
-- 4. RPC add_payment: the ONLY way the app records a payment.
--    amount <= 0 rejected; overpayment rejected; idempotency
--    key returns the existing receipt on retry (no doubles).
-- =============================================================
create or replace function public.add_payment(
  p_enrollment_id   uuid,
  p_amount          numeric,
  p_mode            text default 'cash',
  p_paid_on         date  default current_date,
  p_txn_ref         text  default null,
  p_idempotency_key text  default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enrollment public.enrollments;
  v_paid       numeric(10,2);
  v_remaining   numeric(10,2);
  v_id         uuid;
  v_receipt    text;
begin
  -- idempotency: same key = return existing result, no new row
  if p_idempotency_key is not null then
    select id, receipt_no into v_id, v_receipt
      from public.payments
     where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true,
        'payment_id', v_id, 'receipt_no', v_receipt);
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than 0'
      using errcode = 'check_violation';
  end if;

  select * into v_enrollment
    from public.enrollments
   where id = p_enrollment_id
     and left_on is null
     and archived_at is null;
  if not found then
    raise exception 'Active enrollment not found'
      using errcode = 'foreign_key_violation';
  end if;

  select coalesce(sum(amount), 0) into v_paid
    from public.payments
   where enrollment_id = p_enrollment_id
     and status = 'active';
  v_remaining := v_enrollment.fee_total - v_paid;

  if p_amount > v_remaining then
    raise exception 'Amount % exceeds remaining %', p_amount, v_remaining
      using errcode = 'check_violation';
  end if;

  insert into public.payments (enrollment_id, amount, mode, paid_on,
    txn_ref, idempotency_key, created_by)
  values (p_enrollment_id, p_amount, p_mode, p_paid_on,
    p_txn_ref, p_idempotency_key, auth.uid())
  returning id, receipt_no into v_id, v_receipt;

  return jsonb_build_object('ok', true, 'duplicate', false,
    'payment_id', v_id, 'receipt_no', v_receipt);
end;
$$;

revoke all on function public.add_payment(uuid, numeric, text, date, text, text)
  from public, anon;
grant execute on function public.add_payment(uuid, numeric, text, date, text, text)
  to authenticated;

-- =============================================================
-- 5. RPC cancel_payment: wrong entry cancelled with a reason.
--    Original row stays visible; status recalculates on its own.
-- =============================================================
create or replace function public.cancel_payment(
  p_payment_id uuid,
  p_reason     text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments;
begin
  if p_reason is null or length(trim(p_reason)) < 3 then
    raise exception 'A cancel reason of at least 3 characters is required'
      using errcode = 'check_violation';
  end if;

  select * into v_payment from public.payments
   where id = p_payment_id and status = 'active';
  if not found then
    raise exception 'Active payment not found (already cancelled?)'
      using errcode = 'foreign_key_violation';
  end if;

  update public.payments set
    status = 'cancelled',
    cancelled_reason = trim(p_reason),
    cancelled_by = auth.uid(),
    cancelled_at = now()
  where id = p_payment_id;

  insert into public.audit_log (table_name, record_id, action,
    old_value, new_value, changed_by)
  values ('payments', p_payment_id, 'cancel_payment',
    jsonb_build_object('status', 'active', 'amount', v_payment.amount),
    jsonb_build_object('status', 'cancelled', 'reason', trim(p_reason)),
    auth.uid());

  return jsonb_build_object('ok', true, 'payment_id', p_payment_id);
end;
$$;

revoke all on function public.cancel_payment(uuid, text)
  from public, anon;
grant execute on function public.cancel_payment(uuid, text)
  to authenticated;

commit;
