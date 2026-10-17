-- =============================================================
-- Migration 004 (final, as applied): attendance + v_attendance_summary
-- Project: EduFlow OS | Environment: DEV first, then LIVE
-- Depends on: 001/001b (enrollments, fn_block_delete)
-- Rules: idempotent, non-destructive, RLS on (policies in 005),
--        Present/Absent only, never deleted, percent never stored
-- =============================================================

begin;

-- 1. attendance: one row per enrollment per date; Present/Absent only.
create table if not exists public.attendance (
  id             uuid primary key default gen_random_uuid(),
  enrollment_id  uuid not null references public.enrollments(id),
  att_date       date not null,
  status         text not null check (status in ('present','absent')),
  marked_by      uuid references auth.users(id) default auth.uid(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (enrollment_id, att_date)
);

create index if not exists attendance_by_date_idx on public.attendance (att_date);
create index if not exists enrollments_by_batch_idx on public.enrollments (batch_id);

-- 2. Guard: valid dates, active enrollment, only status can be corrected.
create or replace function public.fn_attendance_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_enr   public.enrollments;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if tg_op = 'UPDATE' then
    if new.enrollment_id <> old.enrollment_id or new.att_date <> old.att_date then
      raise exception 'Only the attendance status can be corrected'
        using errcode = 'check_violation';
    end if;
    new.marked_by := coalesce(auth.uid(), new.marked_by);
    new.updated_at := now();
    return new;
  end if;

  select * into v_enr from public.enrollments where id = new.enrollment_id;
  if not found or v_enr.archived_at is not null or v_enr.left_on is not null then
    raise exception 'Attendance can only be saved for an active enrollment'
      using errcode = 'check_violation';
  end if;
  if new.att_date < v_enr.joined_on then
    raise exception 'Attendance date (%) is before the student joined (%)', new.att_date, v_enr.joined_on
      using errcode = 'check_violation';
  end if;
  if new.att_date > v_today then
    raise exception 'Attendance cannot be saved for a future date'
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;

drop trigger if exists trg_attendance_guard on public.attendance;
create trigger trg_attendance_guard
  before insert or update on public.attendance
  for each row execute function public.fn_attendance_guard();

-- 3. RLS on (policies come in 005); never deleted or truncated.
alter table public.attendance enable row level security;

revoke delete, truncate on public.attendance from anon, authenticated;

drop trigger if exists trg_block_delete on public.attendance;
create trigger trg_block_delete before delete on public.attendance
  for each statement execute function public.fn_block_delete();
drop trigger if exists trg_block_truncate on public.attendance;
create trigger trg_block_truncate before truncate on public.attendance
  for each statement execute function public.fn_block_delete();

-- 4. Logged-out visitors (anon) never need table access in this app.
revoke all on all tables in schema public from anon;

-- 5. v_attendance_summary: always calculated, never stored.
--    total_days = distinct dates attendance was saved for the batch, on/after joined_on.
--    No saved days -> attendance_percent is NULL ("No attendance yet").
create or replace view public.v_attendance_summary with (security_invoker = true) as
select
  e.id as enrollment_id,
  e.student_id,
  e.batch_id,
  e.joined_on,
  coalesce(st.total_days, 0)::int   as total_days,
  coalesce(st.present_days, 0)::int as present_days,
  (coalesce(st.total_days, 0) - coalesce(st.present_days, 0))::int as absent_days,
  case
    when coalesce(st.total_days, 0) = 0 then null
    else round(st.present_days::numeric * 100.0 / st.total_days, 1)
  end as attendance_percent
from public.enrollments e
left join lateral (
  select
    count(distinct a.att_date) as total_days,
    count(distinct a.att_date) filter (where a.enrollment_id = e.id and a.status = 'present') as present_days
  from public.attendance a
  join public.enrollments e2 on e2.id = a.enrollment_id
  where e2.batch_id = e.batch_id
    and a.att_date >= e.joined_on
) st on true
where e.left_on is null
  and e.archived_at is null;

commit;
