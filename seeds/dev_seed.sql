-- =============================================================
-- DEV SEED (NOT a migration). Keep this file in /seeds, never in /migrations.
-- Project: EduFlow OS | Ticket: T-108
-- Depends on: migrations 001-007 applied, owner profile exists.
--
-- HOW TO RUN (DEV project only, never live): run these two lines and this
-- whole file in the SAME query run:
--     set app.env = 'dev';
--     <contents of this file>
--
-- GUARDS: refuses unless app.env = 'dev'; refuses if an owner profile is missing;
--         refuses if any class already exists (no double seed).
-- NOTES:  all names and phone numbers are placeholders. Never send real messages
--         to them. Rows cannot be deleted by the app (by design); to reset DEV data
--         a developer must do it with SQL while the protection triggers are disabled.
-- =============================================================

begin;

-- Run as the owner so add_payment (which checks ownership) works
do $$
declare v_owner uuid;
begin
  select user_id into v_owner from public.profiles where role = 'owner' limit 1;
  if v_owner is null then
    raise exception 'REFUSING: no owner profile found (create the owner profile first)';
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
end $$;

-- Guard 1: environment must be marked dev
do $$
begin
  if coalesce(current_setting('app.env', true), '') <> 'dev' then
    raise exception 'REFUSING: seed is DEV ONLY. On the DEV project run: set app.env = ''dev''; in the same run.';
  end if;
end $$;

-- Guard 2: refuse if any class already exists
do $$
begin
  if exists (select 1 from public.classes) then
    raise exception 'REFUSING: classes already exist - seed runs only on an empty database';
  end if;
end $$;

insert into public.classes (name) values ('8th'), ('9th'), ('10th');

insert into public.subjects (name) values
  ('Maths'), ('Science'), ('English'), ('Hindi'), ('Social Science'), ('Marathi');

insert into public.batches (class_id, name, default_fee, timing_note)
select c.id, v.batch_name, v.fee, v.timing
from public.classes c
join (values
  ('10th', '10th All Subjects', 8000, 'Mon-Sat 6-8 PM'),
  ('10th', '10th Normal',       5000, 'Mon-Fri 5-7 PM'),
  ('9th',  '9th Morning',       4500, 'Mon-Sat 7-9 AM'),
  ('8th',  '8th Evening',       4000, 'Mon-Fri 4-6 PM')
) v(cls, batch_name, fee, timing) on v.cls = c.name;

-- "10th All Subjects" = all 6 subjects, the other batches = 3
insert into public.batch_subjects (batch_id, subject_id)
select b.id, s.id
from public.batches b
join public.subjects s on
  (b.name = '10th All Subjects'
     and s.name in ('Maths','Science','English','Hindi','Social Science','Marathi'))
  or (b.name <> '10th All Subjects'
     and s.name in ('Maths','Science','English'));

-- Meera has parent_opt_in = false (for consent-flag testing)
insert into public.students (full_name, parent_name, parent_phone, parent_opt_in)
values
  ('Aarav Sharma', 'Rakesh Sharma', '919812345601', true),
  ('Priya Patil',  'Sunita Patil',  '919812345602', true),
  ('Rohan Verma',  'Mahesh Verma',  '919812345603', true),
  ('Sneha Joshi',  'Anil Joshi',    '919812345604', true),
  ('Kabir Khan',   'Farhan Khan',   '919812345605', true),
  ('Meera Desai',  'Nilesh Desai',  '919812345606', false);

-- Joined 10 days ago (IST) so the attendance dates below are valid
insert into public.enrollments (student_id, batch_id, fee_total, joined_on)
select s.id, b.id, b.default_fee, (now() at time zone 'Asia/Kolkata')::date - 10
from public.students s
join public.batches b on (
     (s.full_name in ('Aarav Sharma','Priya Patil') and b.name = '10th All Subjects')
  or (s.full_name = 'Rohan Verma'   and b.name = '10th Normal')
  or (s.full_name in ('Sneha Joshi','Kabir Khan') and b.name = '9th Morning')
  or (s.full_name = 'Meera Desai'    and b.name = '8th Evening')
);

-- Payments through the add_payment RPC:
-- Aarav 8000 of 8000 (paid), Priya 5000 of 8000 (partial), Rohan 3000 of 5000 (partial)
do $$
declare r record;
begin
  for r in
    select e.id as enroll_id, s.full_name, v.amount
    from public.enrollments e
    join public.students s on s.id = e.student_id
    join (values ('Aarav Sharma', 8000), ('Priya Patil', 5000), ('Rohan Verma', 3000)) v(fname, amount)
      on v.fname = s.full_name
  loop
    perform public.add_payment(
      p_enrollment_id   => r.enroll_id,
      p_amount          => r.amount,
      p_mode            => 'cash',
      p_paid_on         => (now() at time zone 'Asia/Kolkata')::date - 7,
      p_txn_ref         => null,
      p_idempotency_key => 'seed-' || r.full_name
    );
  end loop;
end $$;

-- Attendance: 5 class days x 6 students = 30 rows (statuses are 'present' / 'absent')
--   Aarav 100% | Priya 80% | Rohan 60% | Sneha 80% | Kabir 100% | Meera 40%
do $$
declare
  d int;
  v_today date := (now() at time zone 'Asia/Kolkata')::date;
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
    select e.id, v_today - (5 - d),
           case m.st when 'P' then 'present' else 'absent' end
    from public.enrollments e
    join public.students s on s.id = e.student_id
    join (values
      ('Aarav Sharma', 1), ('Priya Patil', 2), ('Rohan Verma', 3),
      ('Sneha Joshi', 4), ('Kabir Khan', 5), ('Meera Desai', 6)
    ) idx(fname, ord) on idx.fname = s.full_name
    cross join lateral (select plan_matrix[(idx.ord - 1) * 5 + (d + 1)] as st) m;
  end loop;
end $$;

commit;
