-- =============================================================
-- Migration 001 (as applied): core tables
-- Tables: profiles, classes, subjects, batches, batch_subjects, students, enrollments
-- Rules: idempotent, non-destructive, RLS on (policies in 005),
--        DELETE revoked + blocked by trigger (statement-level added in 001b)
-- =============================================================

begin;

create table if not exists public.profiles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users(id),
  full_name   text not null,
  role        text not null default 'owner' check (role in ('owner')),
  created_at  timestamptz not null default now()
);

create table if not exists public.classes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

create unique index if not exists classes_active_name_unique
  on public.classes (lower(name))
  where archived_at is null;

create table if not exists public.subjects (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

create unique index if not exists subjects_active_name_unique
  on public.subjects (lower(name))
  where archived_at is null;

create table if not exists public.batches (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid not null references public.classes(id),
  name         text not null,
  default_fee  numeric(10,2) not null default 0 check (default_fee >= 0),
  timing_note  text,
  archived_at  timestamptz,
  created_at   timestamptz not null default now()
);

create unique index if not exists batches_active_name_unique
  on public.batches (class_id, lower(name))
  where archived_at is null;

create table if not exists public.batch_subjects (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.batches(id),
  subject_id  uuid not null references public.subjects(id),
  created_at  timestamptz not null default now(),
  unique (batch_id, subject_id)
);

create sequence if not exists student_code_seq;

create table if not exists public.students (
  id            uuid primary key default gen_random_uuid(),
  student_code  text not null unique default ('STU' || lpad(nextval('student_code_seq')::text, 5, '0')),
  full_name     text not null,
  parent_name   text,
  parent_phone  text check (parent_phone is null or parent_phone ~ '^91[6-9][0-9]{9}$'),
  parent_opt_in boolean not null default false,
  school        text,
  notes         text,
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);

create table if not exists public.enrollments (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id),
  batch_id      uuid not null references public.batches(id),
  joined_on     date not null default current_date,
  left_on       date,
  fee_total     numeric(10,2) not null check (fee_total >= 0),
  billing_type  text not null default 'one_time' check (billing_type in ('one_time', 'monthly')),
  archived_at   timestamptz,
  created_at    timestamptz not null default now()
);

alter table public.enrollments
  drop constraint if exists enrollments_dates_valid;
alter table public.enrollments
  add constraint enrollments_dates_valid
  check (left_on is null or left_on >= joined_on);

create unique index if not exists enrollments_active_unique
  on public.enrollments (student_id, batch_id)
  where left_on is null and archived_at is null;

alter table public.profiles        enable row level security;
alter table public.classes         enable row level security;
alter table public.subjects        enable row level security;
alter table public.batches         enable row level security;
alter table public.batch_subjects  enable row level security;
alter table public.students        enable row level security;
alter table public.enrollments     enable row level security;

revoke delete on public.profiles        from anon, authenticated;
revoke delete on public.classes         from anon, authenticated;
revoke delete on public.subjects        from anon, authenticated;
revoke delete on public.batches         from anon, authenticated;
revoke delete on public.batch_subjects  from anon, authenticated;
revoke delete on public.students        from anon, authenticated;
revoke delete on public.enrollments     from anon, authenticated;

create or replace function public.fn_block_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'DELETE is blocked on % - use archive instead', tg_table_name
    using errcode = 'check_violation';
  return null;
end;
$$;

drop trigger if exists trg_block_delete on public.classes;
create trigger trg_block_delete
  before delete on public.classes
  for each row execute function public.fn_block_delete();

drop trigger if exists trg_block_delete on public.subjects;
create trigger trg_block_delete
  before delete on public.subjects
  for each row execute function public.fn_block_delete();

drop trigger if exists trg_block_delete on public.batches;
create trigger trg_block_delete
  before delete on public.batches
  for each row execute function public.fn_block_delete();

drop trigger if exists trg_block_delete on public.batch_subjects;
create trigger trg_block_delete
  before delete on public.batch_subjects
  for each row execute function public.fn_block_delete();

drop trigger if exists trg_block_delete on public.students;
create trigger trg_block_delete
  before delete on public.students
  for each row execute function public.fn_block_delete();

drop trigger if exists trg_block_delete on public.enrollments;
create trigger trg_block_delete
  before delete on public.enrollments
  for each row execute function public.fn_block_delete();

commit;
