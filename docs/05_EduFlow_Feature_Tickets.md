# EduFlow OS: Feature Ticket List

Priority: P0 = must for MVP, P1 = important, P2 = later. Phases match the roadmap: 0 Accounts, 1 Database, 2 Dashboard core, 3 WhatsApp attendance, 4 Fee reminders and templates, 5 Hardening, 6 Leads and voice.

Rule for every ticket: nothing is hard-deleted, and each ticket is done only when its acceptance criteria pass on the dev project.

## Epic 0: Setup (Phase 0)

| ID | Ticket | Acceptance criteria | Pri |
| --- | --- | --- | --- |
| T-001 | Create accounts (Meta Business, Supabase dev + live, n8n, GitHub, hosting) | All accounts exist; keys stored in a private notes file, not in Git | P0 |
| T-002 | Meta app + test WhatsApp number | One test message from API Setup reaches your own phone | P0 |
| T-003 | Submit WhatsApp templates (absent alert, fee reminder) in Utility category | Templates submitted; status visible in Meta | P0 |
| T-004 | Start Meta Business Verification | Documents submitted | P0 |
| T-005 | Confirm open questions with teacher (monthly vs total fee, template wording, WhatsApp number) | Answers written down | P0 |

## Epic 1: Database (Phase 1)

| ID | Ticket | Acceptance criteria | Pri |
| --- | --- | --- | --- |
| T-101 | Core tables: classes, subjects, batches, batch_subjects, students, enrollments | Tables created via SQL migration files; foreign keys work | P0 |
| T-102 | payments, attendance, message_templates, reminder_settings, message_log, leads, call_log, audit_log tables | Created with constraints (amount > 0, unique attendance per enrollment/date, phone format) | P0 |
| T-103 | `enrollment_fees` view (paid, remaining, status) | Pending/Partial/Paid shown correctly for test data | P0 |
| T-104 | RPC `add_payment` with remaining check, receipt number, idempotency key | Overpayment, zero and duplicate key are rejected | P0 |
| T-105 | RPC `cancel_payment` with reason | Payment shows Cancelled; status recalculates | P0 |
| T-109 | `v_students_overview` view: class, batch, student, student_code, parent name, parent phone, enrollment date, fee_total, paid, remaining, fee status | One row per active enrollment; class always from the enrollment's batch; used as the single read source for the Students page | P0 |
| T-110 | `v_attendance_summary` view: total_days, present_days, attendance_percent per enrollment | Live-calculated, never stored; counts only saved attendance dates on/after joined_on; days before joining do not count | P0 |
| T-106 | RLS policies per security matrix + DELETE blocked by policy and trigger | Owner cannot delete any row; select/insert/update work | P0 |
| T-107 | Audit triggers on core tables | Every change creates an audit_log row | P0 |
| T-108 | Seed script for dev only | Sample classes, batches, students load on dev; script refuses to run on live | P1 |

## Epic 2: Dashboard core (Phase 2)

| ID | Ticket | Acceptance criteria | Pri |
| --- | --- | --- | --- |
| T-201 | Project structure: split prototype into index.html, css, js modules; config.js | App loads from a local server with no console errors | P0 |
| T-202 | Staff login and auth guard | Wrong password rejected; page redirects to login when logged out | P0 |
| T-203 | Classes page: add, rename, archive, restore | Changes persist after refresh; archived hidden unless toggle on | P0 |
| T-204 | Batches: add/edit/archive with default fee and subject checkboxes | Subjects saved per batch; two batches in one class can differ | P0 |
| T-205 | Class then Batch dependent dropdown component | Batch list changes with class; used on all pages | P0 |
| T-206 | Students page: sections per class (8th, 9th, 10th) with batches inside, never mixed | Class comes from active enrollment's batch (via v_students_overview); no cross-class mixed table | P0 |
| T-206b | Students compact rows: name + student_code, fee badge, attendance % badge (warning below 75%), small actions menu | Parent name/number, enrollment date, fee structure, attendance summary and payment history only in the detail panel; mobile: row = card, detail = bottom sheet | P0 |
| T-207 | Add student modal with validation and duplicate warnings | Invalid phone blocked; duplicate name/phone warns; saved as 91XXXXXXXXXX | P0 |
| T-208 | Student detail modal (enrollment date, parent info, fee summary, attendance summary, payment history) | All fields correct against DB views | P0 |
| T-209 | Remove from batch / archive student with undo and restore; promotion = end old enrollment + create new one | Row hidden, history kept, restore works; promoted student appears in the new class section | P0 |
| T-210 | Fee set/edit per student with change logged | Fee change appears in audit log; cannot go below amount already paid | P0 |
| T-211 | Fees table (`feesTable`) with total/paid/remaining/status | Matches `enrollment_fees` view | P0 |
| T-212 | Add payment with confirmation screen | Confirm screen shows name, batch, parent name, last 4 phone digits, amount, mode | P0 |
| T-213 | Payment guards in UI mirroring DB (overpay, duplicate within minutes) | Warnings shown; DB still rejects bad data if UI bypassed | P0 |
| T-214 | Cancel payment flow with required reason | Cancelled entry visible; status recalculates | P0 |
| T-215 | Loading, empty, error states and double-submit protection | Every list shows all three states; buttons disable during requests | P0 |
| T-216 | Dashboard summary cards | Totals match database counts | P1 |
| T-217 | Mobile responsive layout (tables to cards) | Usable on 360px wide screen | P1 |

## Epic 3: WhatsApp attendance (Phase 3)

| ID | Ticket | Acceptance criteria | Pri |
| --- | --- | --- | --- |
| T-301 | n8n on Docker with fixed public URL; credentials set | Test webhook reachable over HTTPS | P0 |
| T-302 | Meta webhook verification + status webhook (WF-06) | Challenge passes; signature verified; message_log updates on delivered/read/failed | P0 |
| T-303 | WF-01 absent-alerts (tested with Postman first) | Sends approved template to test number; duplicate request_id sends only once | P0 |
| T-304 | Webhook auth: verify Supabase user JWT | Request without valid token is rejected | P0 |
| T-305 | Attendance page: mark Present/Absent per batch and date | Saved with unique (enrollment, date); edits logged | P0 |
| T-306 | "Notify parents" preview + confirm + per-student result | Absent students listed; Sent only after Meta accepts; Failed shows Retry | P0 |
| T-307 | Skip already-notified students for the same date | Second click sends nothing new | P0 |
| T-308 | Messages log page with status chips and filters | Shows Sent/Delivered/Read/Failed and error text | P1 |

## Epic 4: Fee reminders and templates (Phase 4)

| ID | Ticket | Acceptance criteria | Pri |
| --- | --- | --- | --- |
| T-401 | Message Templates page: write with placeholders, live preview | Placeholders insert; preview fills sample values | P0 |
| T-402 | WF-04 submit template to Meta (Utility); WF-05 status sync | Status Pending/Approved/Rejected with reason shown in dashboard | P0 |
| T-403 | Only approved templates selectable in send dialogs | Unapproved hidden/disabled | P0 |
| T-404 | "Send Reminder" button on student row with preview and confirm | Message shows real pending amount and pay-by date; logged | P0 |
| T-405 | WF-02 single fee reminder re-checks fees before sending | Student who just paid is skipped | P0 |
| T-406 | Settings page for auto reminders (ON/OFF, day, time, scope, pay-by date, template, min gap) | Saved in reminder_settings; reload shows same values | P0 |
| T-407 | WF-03 auto reminders: one by one with delay, skip paid and recently reminded, summary | Dry run lists correct students; real run sends once per student; summary shows sent/failed | P0 |
| T-408 | "Preview who will get a message" and "Send now" with confirm | Preview equals actual recipients | P1 |
| T-409 | "Send from my WhatsApp" wa.me fallback | Opens WhatsApp with prefilled editable text | P1 |
| T-410 | Parent opt-in flag respected in all sends | Opted-out parent never receives a message | P0 |

## Epic 5: Hardening and launch (Phase 5)

| ID | Ticket | Acceptance criteria | Pri |
| --- | --- | --- | --- |
| T-501 | Nightly backup to Google Drive (WF-07) | New backup file every night; last N kept | P0 |
| T-502 | Restore test on dev project | Data restored and verified once | P0 |
| T-503 | Export data button | Downloads all tables as files | P1 |
| T-504 | Keep-alive ping (WF-08) | Daily query runs | P1 |
| T-505 | Error handler workflow (WF-10) | Failed run notifies developer | P1 |
| T-506 | Audit log viewer | Teacher can see who changed what | P2 |
| T-507 | Security checklist pass (see Security doc section 12) | All items ticked | P0 |
| T-508 | Meta Business Verification done and live number approved | Messages go to real parents | P0 |
| T-509 | Deploy frontend and n8n VPS; live Supabase migrations | Live app works end to end with real teacher login | P0 |
| T-510 | Teacher training + short written guide | Teacher can add class, batch, student, payment and send reminder alone | P1 |

## Epic 6: Leads and voice calls (Phase 6, stretch)

| ID | Ticket | Acceptance criteria | Pri |
| --- | --- | --- | --- |
| T-601 | Leads page dynamic (`leadsTable`, `addLeadModal`) | Add/track leads, status chips | P1 |
| T-602 | Decide telephony number and cost for India outbound calls | Decision recorded with costs | P1 |
| T-603 | WF-09: new lead triggers VAPI call | Call placed to own test number | P2 |
| T-604 | Call result written back to lead and call_log | Outcome and summary visible in dashboard | P2 |
| T-605 | Calling-hours guard and consent check | No calls outside allowed hours or without consent | P2 |

## Definition of Done (all tickets)

Works on dev; acceptance criteria shown to pass; no secrets in code; no hard delete added; loading/error states present; change committed to Git with migration files for any database change.
