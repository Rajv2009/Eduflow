# EduFlow OS: Product Requirements Document (PRD)

Version 1.1 (MVP, single client). Status: draft for build.

## 1. Overview

EduFlow OS is a lightweight web dashboard plus automation engine for a local Indian tuition/coaching institute. It lets the teacher manage classes, batches, students and fees, and send WhatsApp messages to parents (absent alerts, fee reminders) with one click or automatically.

## 2. Problem

- Teachers forget to inform parents when a student is absent.
- Staff hesitate to call parents about overdue fees.
- New leads go cold because nobody contacts them immediately.
- Fee records get confused when two students share a name or an entry is wrong.

## 3. Goals and non-goals

Goals (MVP)

1. Teacher manages his own classes, batches (with subjects) and students without developer help.
2. Fee tracking per student that can never show a wrong "Paid" status.
3. One-click and automatic WhatsApp fee reminders in the teacher's own wording.
4. Batch-wise attendance with WhatsApp absent alerts to parents.
5. Client data is never lost or reset by a small error.

Non-goals (MVP): parent/student login or app, online fee payment gateway, exams/marks, timetable, multi-institute SaaS billing, voice calls to parents.

## 4. Users

| User | Description | Access |
| --- | --- | --- |
| Teacher (Owner) | The single client. Uses the dashboard daily, likely on a phone and a laptop. | Full app access, no hard delete |
| Parent | Receives WhatsApp messages only | No login |
| Developer/Admin | You | Supabase and n8n admin, outside the app |

## 5. Client structure (domain model)

Classes (8th, 9th, 10th) contain Batches. Each batch has its own set of subjects chosen by the client (e.g. "10th All Subjects": 6 subjects, "10th Normal": 3 subjects). Students join batches through enrollments. Fees and attendance belong to the enrollment.

Students are always shown in separate sections per class (8th, 9th, 10th), with batches inside each class section; they are never mixed across classes. A student's class always comes from the batch of their active enrollment, never from a stored field on the student. When a student is promoted, the old enrollment is ended (left_on) and a new enrollment is created in the new class's batch; history is kept.

## 6. Scope by module

### M1 Classes, batches, subjects

- FR-1.1 Add, rename, archive, restore a class.
- FR-1.2 Add, rename, archive, restore a batch inside a class, with default fee.
- FR-1.3 Create subjects and tick which subjects belong to each batch.

### M2 Students

- FR-2.1 Add a student with name, parent name, parent WhatsApp number, class and batch, enrollment date, fee.
- FR-2.2 Edit student details. Archive and restore a student. "Remove from batch" ends the enrollment (left_on), history is kept.
- FR-2.3 Students page shows one section per class (8th, 9th, 10th), with batches inside each class section; students are never mixed across classes. Class always comes from the active enrollment's batch.
- FR-2.4 Warn on duplicate name in the same batch or duplicate parent phone.
- FR-2.5 Student rows stay compact: name with student code, fee badge, attendance % badge (with a warning style below 75%), and a small actions menu. Parent name and number, enrollment date, fee structure, attendance summary (total days, present days, %) and payment history appear only in a detail panel when the row is tapped; on mobile the row is a card and the detail panel is a bottom sheet.
- FR-2.6 A read view (`v_students_overview`) provides class, batch, student, student_code, parent name, parent phone, enrollment date, fee_total, and (once payments exist) paid, remaining and fee status, as the single read source for the Students page list and detail panel.

### M3 Fees

- FR-3.1 Client sets each student's fee; editable later with the change logged.
- FR-3.2 Status is calculated: Pending (nothing paid), Partial, Paid. Never set by hand.
- FR-3.3 Show total, paid, remaining.
- FR-3.4 Add payment with confirmation screen (name, class/batch, parent name, last 4 digits of parent phone, amount, mode cash/UPI, optional UPI reference).
- FR-3.5 Block amount <= 0 or above remaining. Warn on same-amount duplicate within a few minutes.
- FR-3.6 Payments are never edited or deleted. A wrong entry is cancelled with a reason and a new entry is created. Both stay visible.
- FR-3.7 Auto receipt number per payment.

### M4 WhatsApp messaging

- FR-4.1 "Send Reminder" on a student row: preview, confirm, send.
- FR-4.2 Auto reminders: ON/OFF, fixed date and time, scope (all or by class/batch), pay-by date, template choice. Sends one by one with a gap, skips paid students, skips anyone reminded within N days, re-checks fees right before sending, shows a summary.
- FR-4.3 Message Templates page: client writes his own wording with placeholders ({student_name}, {parent_name}, {total}, {paid}, {pending}, {due_date}, {months_since_joining}); system submits to Meta for approval; status Pending / Approved / Rejected (with reason). Only Approved templates can be sent.
- FR-4.4 Fallback "Send from my WhatsApp" button (wa.me link, editable, manual).
- FR-4.5 Message log with Sent (accepted by Meta), Delivered, Read, Failed, and Retry.

### M5 Attendance

- FR-5.1 Mark attendance batch-wise per date (present/absent). Present and Absent are the only statuses for now.
- FR-5.2 Absent students get a WhatsApp message to the parent with one click ("Notify parents"), previewing the list first. One message per student per date.
- FR-5.3 Attendance for a date can be corrected; changes are logged.
- FR-5.4 A derived view (`v_attendance_summary`) computes per enrollment: total_days = distinct dates on which attendance was saved for that batch on or after the student's joined_on, present_days, and attendance_percent. It is calculated live and never stored. Days with no saved attendance and days before joining do not count.

### M6 Leads and AI call (last stage)

- FR-6.1 Add and track leads (name, phone, class interest, status).
- FR-6.2 New lead triggers an instant AI voice call (VAPI + OpenAI); outcome saved to the lead and call log.

### M7 System

- FR-7.1 Staff login.
- FR-7.2 Nightly backup to Google Drive.
- FR-7.3 Export data button.
- FR-7.4 Audit log.
- FR-7.5 Keep-alive ping so the free database never pauses.

## 7. Business rules

1. Nothing is hard-deleted by the app. Remove means archive.
2. Fee status is derived from active (non-cancelled) payments only.
3. A reminder is never sent to a student who is paid at the moment of sending.
4. A message shows "Sent" only after Meta accepts it.
5. Phone numbers are stored as E.164 (91XXXXXXXXXX), 10-digit Indian mobile validated.
6. A parent must have opted in before receiving messages (consent flag per student).
7. A student's class is never stored on the student; it always comes from the batch of the active enrollment (promotion = end old enrollment, create new one).
8. Attendance percentage is always calculated live from saved attendance, never stored.

## 8. Non-functional requirements

- Free-tier friendly; works on mobile browsers; initial load under about 3 seconds on 4G (proposed target).
- No data loss on n8n outage; dashboard CRUD must work even if n8n is down.
- Idempotent actions (retries never double-send or double-record).
- All dates in IST.

## 9. Success metrics (proposed, for the pilot)

- Absent alerts sent within minutes of marking attendance.
- Zero fee-status errors reported by the teacher.
- Share of overdue students reminded on the fixed date.
- Zero data-loss incidents; restore from backup tested once.

## 10. Assumptions and open questions

1. Fee model: one-time total or monthly recurring? (decide with the teacher; schema must allow monthly later)
2. Which WhatsApp number will be used (must not be active on the normal WhatsApp app)?
3. Teacher's preferred wording and language (Hindi, English, Hinglish) for the first 2-3 templates.
4. Meta Business Verification documents available for the institute?
5. AI voice calls to Indian numbers need a telephony number and rules compliance; confirm cost before M6.

## 11. Risks

Meta template rejection or delay; Meta pricing per message; free-tier limits and Supabase pausing; n8n hosting downtime; parent consent and data-privacy compliance; telephony cost and rules for voice calls.

## 12. Release plan

Phases 0-6 as in the Feature Ticket List. MVP = Phases 0-5. Phase 6 (leads and voice calls) is a stretch.
