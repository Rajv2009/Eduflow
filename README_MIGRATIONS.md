# EduFlow OS: final SQL files (match the eduflow-dev database exactly)

These files are the exact SQL applied to the `eduflow-dev` Supabase project, in this order.
Running them in order on a fresh, empty Supabase project gives the same database.

## /migrations (run in this order)
1. 001_core_tables.sql
2. 001b_stronger_delete_protection.sql
3. 002_payments.sql
4. 002b_payments_hardening.sql
5. 003_fees_functions.sql        (audit_log, enrollment_fees view, fee guard, add_payment / cancel_payment)
6. 004_attendance.sql            (attendance + v_attendance_summary)
7. 005_rls_policies.sql          (owner-only policies, owner checks in payment functions)
8. 006_audit_triggers.sql        (generic audit triggers, profile protections)
9. 007_students_overview.sql     (v_students_overview)

(008_seed_data.sql in this folder is only a pointer: the seed lives in /seeds/dev_seed.sql.)

## /seeds
- dev_seed.sql: fake sample data for DEV ONLY. Never run on the live project. Never put it in /migrations.

## Manual steps after the migrations (not in any file)
- Create the owner's login in Supabase Auth, then insert the owner profile:
  insert into public.profiles (user_id, full_name, role)
  select id, split_part(email, '@', 1), 'owner' from auth.users where email = '<owner email>';
- In Supabase Auth settings turn OFF "Allow new users to sign up".

## Rules baked into the database
- Nothing is hard-deleted (DELETE and TRUNCATE are blocked); remove = archive.
- Fee paid / remaining / status and attendance percent are always calculated, never stored.
- Payments are written only through add_payment / cancel_payment (owner only).
- audit_log is append-only and written only by triggers/functions.
- anon (not logged in) has no access to any table or view.
