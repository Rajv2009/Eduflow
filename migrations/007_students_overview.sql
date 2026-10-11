-- =============================================================
-- Migration 007: v_students_overview (single read source for
--                Students page — class-wise sections, never mixed)
-- Project: EduFlow OS | Environment: DEV ONLY
-- Depends on: 001 (enrollments, students), 002 (payments),
--             003 (enrollment_fees logic)
-- Rules: idempotent, non-destructive, class always from batch
-- =============================================================

begin;

-- =============================================================
-- v_students_overview: one row per active enrollment.
-- Students page reads ONLY this view, never raw tables.
-- Class always comes from the batch of the active enrollment
-- (never from a student field — promotion = new enrollment).
-- security_invoker = underlying RLS applies.
-- =============================================================
create or replace view public.v_students_overview
with (security_invoker = true) as
select
  s.id            as student_id,
  s.student_code,
  s.full_name     as student_name,
  s.parent_name,
  s.parent_phone,
  c.id            as class_id,
  c.name          as class_name,
  b.id            as batch_id,
  b.name          as batch_name,
  e.id            as enrollment_id,
  e.joined_on     as enrollment_date,
  e.fee_total,
  coalesce(p.paid, 0) as paid,
  e.fee_total - coalesce(p.paid, 0) as remaining,
  case
    when e.fee_total = 0 or coalesce(p.paid, 0) >= e.fee_total then 'paid'
    when coalesce(p.paid, 0) <= 0 then 'pending'
    else 'partial'
  end as fee_status
from public.enrollments e
join public.students s on s.id = e.student_id
join public.batches b  on b.id = e.batch_id
join public.classes c  on c.id = b.class_id
left join (
  select enrollment_id, sum(amount) as paid
  from public.payments
  where status = 'active'
  group by enrollment_id
) p on p.enrollment_id = e.id
where e.left_on is null
  and e.archived_at is null
  and s.archived_at is null;

commit;
