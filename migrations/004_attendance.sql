-- =============================================================
-- Migration 004: attendance table + v_attendance_summary view
-- Project: EduFlow OS | Environment: DEV ONLY
-- Depends on: 001 (enrollments)
-- Rules: idempotent, non-destructive, RLS on (locked until 005),
--        DELETE blocked, Present/Absent are the ONLY statuses,
--        percentage ALWAYS calculated live (never stored)
-- =============================================================

begin;

-- =============================================================
-- 1. attendance: one row per active enrollment per date.
--    Corrections happen by UPDATE (logged in audit_log by
--    migration 006 generic triggers), never by delete.
-- =============================================================
create table if not exists public.attendance (
  id             uuid primary key default gen_random_uuid(),
  enrollment_id  uuid not null references public.enrollments(id),
  att_date       date not null,
  status         text not null check (status in ('present','absent')),
  marked_by      uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (enrollment_id, att_date)
);

create index if not exists attendance_by_enrollment_idx
  on public.attendance (enrollment_id);

create index if not exists attendance_by_date_idx
  on public.attendance (att_date);

-- updated_at maintained by trigger
create or replace function public.fn_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at on public.attendance;
create trigger trg_set_updated_at
  before update on public.attendance
  for each row execute function public.fn_set_updated_at();

-- =============================================================
-- 2. RLS on (locked until policy migration 005)
-- =============================================================
alter table public.attendance enable row level security;

-- =============================================================
-- 3. DELETE blocked: REVOKE + BEFORE DELETE trigger
--    (corrections = UPDATE, never delete)
-- =============================================================
revoke delete on public.attendance from anon, authenticated;

drop trigger if exists trg_block_delete on public.attendance;
create trigger trg_block_delete
  before delete on public.attendance
  for each row execute function public.fn_block_delete();

-- =============================================================
-- 4. v_attendance_summary: live-calculated per active enrollment
--    - total_days    = distinct dates on which attendance was
--                      saved for that batch, on/after joined_on
--                      (any student's attendance in the batch
--                      counts as a saved day)
--    - present_days  = distinct dates where THIS student was
--                      present (on/after joined_on)
--    - attendance_percent = present_days / total_days * 100
--    Days with no saved attendance and days before joining
--    DO NOT count. Percent is NEVER stored; 0 saved days
--    returns NULL (frontend shows "No attendance yet").
-- =============================================================
create or replace view public.v_attendance_summary
with (security_invoker = true) as
select
  e.id   as enrollment_id,
  e.student_id,
  e.batch_id,
  e.joined_on,
  coalesce(st.total_days, 0)    as total_days,
  coalesce(st.present_days, 0)  as present_days,
  case
    when coalesce(st.total_days, 0) = 0 then null
    else round(st.present_days::numeric * 100.0 / st.total_days, 1)
  end as attendance_percent
from public.enrollments e
left join lateral (
  select
    count(distinct a.att_date) as total_days,
    count(distinct case
      when a.enrollment_id = e.id and a.status = 'present'
      then a.att_date end) as present_days
  from public.attendance a
  join public.enrollments e2 on e2.id = a.enrollment_id
  where e2.batch_id = e.batch_id
    and a.att_date >= e.joined_on
) st on true
where e.left_on is null
  and e.archived_at is null;

commit;
