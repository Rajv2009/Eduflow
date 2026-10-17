-- =============================================================
-- Migration 007 (final, as applied): v_students_overview
-- Project: EduFlow OS | Environment: DEV first, then LIVE
-- Depends on: 001-006 (enrollment_fees, v_attendance_summary)
-- Rules: idempotent, non-destructive, class always comes from the batch
-- =============================================================

begin;

-- v_students_overview: single read source for the Students page.
-- One row per active enrollment. Class always comes from the batch of the active
-- enrollment (promotion = new enrollment), so students are never mixed between classes.
-- Fee and attendance numbers come from the existing views (single source of truth).
-- fee_status: pending | partial | paid | not_set (fee 0 is never shown as paid).
create or replace view public.v_students_overview with (security_invoker = true) as
select
  s.id            as student_id,
  s.student_code,
  s.full_name     as student_name,
  s.parent_name,
  s.parent_phone,
  s.parent_opt_in,
  c.id            as class_id,
  c.name          as class_name,
  c.created_at    as class_created_at,
  c.archived_at   as class_archived_at,
  b.id            as batch_id,
  b.name          as batch_name,
  b.created_at    as batch_created_at,
  b.archived_at   as batch_archived_at,
  e.id            as enrollment_id,
  e.joined_on     as enrollment_date,
  f.fee_total,
  f.paid,
  f.remaining,
  f.fee_status,
  a.total_days,
  a.present_days,
  a.absent_days,
  a.attendance_percent
from public.enrollments e
join public.students s on s.id = e.student_id
join public.batches b  on b.id = e.batch_id
join public.classes c  on c.id = b.class_id
join public.enrollment_fees f on f.enrollment_id = e.id
join public.v_attendance_summary a on a.enrollment_id = e.id
where e.left_on is null
  and e.archived_at is null
  and s.archived_at is null;

revoke all on all tables in schema public from anon;

commit;
