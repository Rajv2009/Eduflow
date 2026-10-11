-- =============================================================
-- Migration 008: SEED DATA (DEV ONLY - refuses to run elsewhere)
-- Project: EduFlow OS | Ticket: T-108
-- Depends on: 001-007 (all tables, views, RPCs, policies)
--
-- GUARDS:
--   1. Refuses unless database marker app.env = 'dev' is set:
--        alter database postgres set app.env = 'dev';
--      (DEV project only - NEVER on live)
--   2. Refuses if any class already exists (no double-seed)
--
-- Seeds: 3 classes, 6 subjects, 4 batches, batch_subjects,
--        6 students, 6 enrollments, 4 payments (via add_payment
--        RPC), 30 attendance rows (5 dates x 6 students).
-- Result: fee statuses paid/partial/pending all demoed,
--         attendance 60% / 80% / 100% demoed.
-- =============================================================

begin;

-- Guard 1: environment must be marked dev
do $$
begin
  if coalesce(current_setting('app.env', true), '') <> 'dev' then
    raise exception
      'REFUSING: seed is DEV ONLY. On the DEV project run: alter database postgres set app.env = ''dev''; then re-run this seed. NEVER run that command on live.';
  end if;
end $$;

-- Guard 2: refuse if any class already exists
do $$
begin
  if exists (select 1 from public.classes) then
    raise exception 'REFUSING: classes already exist - seed runs only on an empty database';
  end if;
end $$;

-- -------------------------------------------------------------
-- Classes (3)
-- -------------------------------------------------------------
insert into public.classes (name) values ('8th'), ('9th'), ('10th');

-- -------------------------------------------------------------
-- Subjects (6)
-- -------------------------------------------------------------
insert into public.subjects (name) values
  ('Maths'), ('Science'), ('English'), ('Hindi'), ('Social Science'), ('Marathi');

-- -------------------------------------------------------------
-- Batches (4, with default fee)
-- -------------------------------------------------------------
insert into public.batches (class_id, name, default_fee, timing_note)
select c.id, v.batch_name, v.fee, v.timing
from public.classes c
join (values
  ('10th', '10th All Subjects', 8000, 'Mon-Sat 6-8 PM'),
  ('10th', '10th Normal',       5000, 'Mon-Fri 5-7 PM'),
  ('9th',  '9th Morning',       4500, 'Mon-Sat 7-9 AM'),
  ('8th',  '8th Evening',       4000, 'Mon-Fri 4-6 PM')
) v(cls, batch_name, fee, timing) on v.cls = c.name;

-- -------------------------------------------------------------
-- Batch subjects: "10th All Subjects" = all 6, others = 3
-- -------------------------------------------------------------
insert into public.batch_subjects (batch_id, subject_id)
select b.id, s.id
from public.batches b
join public.subjects s on
  (b.name = '10th All Subjects'
     and s.name in ('Maths','Science','English','Hindi','Social Science','Marathi'))
  or (b.name <> '10th All Subjects'
     and s.name in ('Maths','Science','English'));

-- -------------------------------------------------------------
-- Students (6; Meera has parent_opt_in = false for
-- consent-flag testing)
-- -------------------------------------------------------------
insert into public.students (full_name, parent_name, parent_phone, parent_opt_in)
values
  ('Aarav Sharma', 'Rakesh Sharma', '919812345601', true),
  ('Priya Patil',  'Sunita Patil',  '919812345602', true),
  ('Rohan Verma',  'Mahesh Verma',  '919812345603', true),
  ('Sneha Joshi',  'Anil Joshi',    '919812345604', true),
  ('Kabir Khan',   'Farhan Khan',   '919812345605', true),
  ('Meera Desai',  'Nilesh Desai',  '919812345606', false);

-- -------------------------------------------------------------
-- Enrollments (6): batch mapping + fee_total from batch default
-- Aarav, Priya -> 10th All Subjects (8000)
-- Rohan        -> 10th Normal (5000)
-- Sneha, Kabir -> 9th Morning (4500)
-- Meera        -> 8th Evening (4000)
-- -------------------------------------------------------------
insert into public.enrollments (student_id, batch_id, fee_total)
select s.id, b.id, b.default_fee
from public.students s
join public.batches b on (
     (s.full_name in ('Aarav Sharma','Priya Patil') and b.name = '10th All Subjects')
  or (s.full_name = 'Rohan Verma'   and b.name = '10th Normal')
  or (s.full_name in ('Sneha Joshi','Kabir Khan') and b.name = '9th Morning')
  or (s.full_name = 'Meera Desai'    and b.name = '8th Evening')
);

-- -------------------------------------------------------------
-- Payments (4) via add_payment RPC (overpayment guard, receipt)
-- Aarav: 8000 full   | Priya: 5000 of 8000 (partial)
-- Rohan: 3000 of 5000 (partial) | Sneha: 0 (pending)
-- -------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select e.id as enroll_id, s.full_name, v.amount
    from public.enrollments e
    join public.students s on s.id = e.student_id
    join (values
      ('Aarav Sharma', 8000),
      ('Priya Patil',  5000),
      ('Rohan Verma',   3000)
    ) v(fname, amount) on v.fname = s.full_name
  loop
    perform public.add_payment(
      p_enrollment_id   => r.enroll_id,
      p_amount          => r.amount,
      p_mode            => 'cash',
      p_paid_on         => current_date - 7,
      p_txn_ref         => null,
      p_idempotency_key => 'seed-' || r.full_name
    );
  end loop;
end $$;

-- -------------------------------------------------------------
-- Attendance: 5 dates x 6 students = 30 rows
--   Aarav   : P P P P P  (100%)
--   Priya   : P P P P A  (80%)
--   Rohan   : P P P A A  (60%)
--   Sneha   : P P P P A  (80%)
--   Kabir   : P P P P P  (100%)
--   Meera   : P P A A A  (40%)
-- =============================================================
do $$
declare
  d int;
  plan_matrix constant text[] :=
    array['P','P','P','P','P',
          'P','P','P','P','A',
          'P','P','P','A','A',
          'P','P','P','P','A',
          'P','P','P','P','P',
          'P','P','A','A','A'];
begin
  for d in 0..4 loop
    insert into public.attendance (enrollment_id, att_date, status)
    select e.id, current_date - (5 - d), m.st
    from public.enrollments e
    join public.students s on s.id = e.student_id
    join (values
      ('Aarav Sharma', 1), ('Priya Patil', 2), ('Rohan Verma', 3),
      ('Sneha Joshi', 4), ('Kabir Khan', 5), ('Meera Desai', 6)
    ) idx(fname, ord) on idx.fname = s.full_name
    cross join lateral (
      select plan_matrix[(idx.ord - 1) * 5 + (d + 1)] as st
    ) m;
  end loop;
end $$;

commit;
