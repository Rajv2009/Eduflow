-- =============================================================
-- Migration 002 (as applied): payments table
-- Depends on: 001 (enrollments, fn_block_delete)
-- Hardening (immutability, receipt number, cancel rules) follows in 002b.
-- =============================================================

begin;

create table if not exists public.payments (
  id               uuid primary key default gen_random_uuid(),
  enrollment_id    uuid not null references public.enrollments(id),
  amount           numeric(10,2) not null check (amount > 0),
  paid_on          date not null default current_date,
  mode             text not null default 'cash' check (mode in ('cash','upi')),
  txn_ref          text,
  receipt_no       text not null unique,
  status           text not null default 'active' 'active','cancelled'),
  cancelled_reason text,
  cancelled_by     uuid references auth.users(id),
  cancelled_at     timestamptz,
  created_by       uuid references auth.users(id),
  idempotency_key  text unique,
  period_month     date,
  created_at       timestamptz not null default now()
);

create index if not exists payments_by_enrollment_idx
  on public.payments (enrollment_id);

create index if not exists payments_by_status_idx
  on public.payments (status);

alter table public.payments enable row level security;

revoke delete on public.payments from anon, authenticated;

drop trigger if exists trg_block_delete on public.payments;
create trigger trg_block_delete
  before delete on public.payments
  for each row execute function public.fn_block_delete();

create sequence if not exists receipt_no_seq;

create or replace function public.fn_set_receipt_no()
returns trigger
language plpgsql
as $$
begin
  if new.receipt_no is null or new.receipt_no = '' then
    new.receipt_no := 'EF' || lpad(nextval('receipt_no_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_receipt_no on public.payments;
create trigger trg_set_receipt_no
  before insert on public.payments
  for each row execute function public.fn_set_receipt_no();

commit;
