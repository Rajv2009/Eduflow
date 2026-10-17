-- =============================================================
-- Migration 002b (as applied): payments hardening
-- Statement-level delete + truncate block, receipt number always system-generated,
-- cancel fields consistent, payments immutable (only active -> cancelled), IST defaults
-- =============================================================

begin;

drop trigger if exists trg_block_delete on public.payments;
create trigger trg_block_delete before delete on public.payments
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_truncate on public.payments;
create trigger trg_block_truncate before truncate on public.payments
  for each statement execute function public.fn_block_delete();
revoke truncate on public.payments from anon, authenticated;

create or replace function public.fn_set_receipt_no()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.receipt_no := 'EF' || lpad(nextval('public.receipt_no_seq')::text, 4, '0');
  return new;
end;
$$;

alter table public.payments drop constraint if exists payments_cancel_consistent;
alter table public.payments add constraint payments_cancel_consistent check (
  (status = 'active' and cancelled_reason is null and cancelled_by is null and cancelled_at is null)
  or (status = 'cancelled' and length(trim(coalesce(cancelled_reason, ''))) > 0 and cancelled_at is not null)
);

create or replace function public.fn_payments_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'cancelled' then
    raise exception 'Cancelled payments cannot be changed' using errcode = 'check_violation';
  end if;
  if new.status <> 'cancelled' then
    raise exception 'Payments cannot be edited; cancel with a reason instead' using errcode = 'check_violation';
  end if;
  if (new.id, new.enrollment_id, new.amount, new.paid_on, new.mode, new.txn_ref,
      new.receipt_no, new.idempotency_key, new.period_month, new.created_by, new.created_at)
     is distinct from
     (old.id, old.enrollment_id, old.amount, old.paid_on, old.mode, old.txn_ref,
      old.receipt_no, old.idempotency_key, old.period_month, old.created_by, old.created_at) then
    raise exception 'Only the cancellation fields can change' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_payments_immutable on public.payments;
create trigger trg_payments_immutable
  before update on public.payments
  for each row execute function public.fn_payments_immutable();

alter table public.payments alter column paid_on
  set default ((now() at time zone 'Asia/Kolkata')::date);
alter table public.enrollments alter column joined_on
  set default ((now() at time zone 'Asia/Kolkata')::date);

commit;
