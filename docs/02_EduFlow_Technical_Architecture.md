# EduFlow OS: Technical Architecture Document

## 1. System overview

Teacher browser (static HTML/CSS/JS)
        |                       \
        | supabase-js (anon key,  \  HTTPS + user JWT
        | RLS-protected CRUD)      \
        v                           v
   Supabase (Postgres + Auth)     n8n (always-on VPS, Docker)
        ^                           |        |         |
        | service_role (n8n only)   |        |         |
        +---------------------------+        |         |
                                             v         v
                               Meta WhatsApp Cloud API   VAPI + OpenAI (Phase 6)
                                             |
                                  status webhooks back to n8n

Principle: the dashboard talks directly to Supabase for all data (so it works when n8n is down). n8n is used only for things that need secrets or schedules: WhatsApp sending, Meta template management, cron jobs, backups, voice calls.

## 2. Environments

| Env | Supabase | n8n | Frontend |
| --- | --- | --- | --- |
| dev | project "eduflow-dev" | local Docker + tunnel | local server / preview deploy |
| live | project "eduflow-live" | VPS Docker, persistent volume, fixed domain | Netlify/Vercel/Cloudflare Pages |

Never test on live data. Migrations are SQL files in Git, applied to dev first.

## 3. Data model

All tables have id (uuid), created_at; most have archived_at (null = active). Names below are logical, finalise types in Phase 1.

| Table | Key columns |
| --- | --- |
| profiles | user_id, full_name, role (owner) |
| classes | name, archived_at |
| subjects | name, archived_at |
| batches | class_id, name, default_fee, timing_note, archived_at |
| batch_subjects | batch_id, subject_id |
| students | student_code (unique), full_name, parent_name, parent_phone (E.164), parent_opt_in, school, notes, archived_at |
| enrollments | student_id, batch_id, joined_on, left_on, fee_total, archived_at |
| payments | enrollment_id, amount (>0), paid_on, mode (cash/upi), txn_ref, receipt_no (unique), status (active/cancelled), cancelled_reason, cancelled_by, cancelled_at, created_by, idempotency_key (unique) |
| attendance | enrollment_id, date, status (present/absent), marked_by; unique (enrollment_id, date) |
| message_templates | name, body_text (with {placeholders}), meta_template_name, language, category (utility), status (draft/pending/approved/rejected), rejection_reason |
| reminder_settings | enabled, send_day, send_time, scope_type (all/class/batch), scope_ids, pay_by_date, template_id, min_gap_days |
| message_log | student_id, enrollment_id, type (absent/fee_manual/fee_auto), template_id, to_phone, wa_message_id, status (queued/sent/delivered/read/failed), error, idempotency_key (unique), updated_at |
| leads | name, phone, class_interest, status, source |
| call_log | lead_id, vapi_call_id, outcome, summary, duration |
| audit_log | table_name, row_id, action, old_data, new_data, user_id, at |

Derived view enrollment_fees: for each enrollment, paid = sum of active payments, remaining = fee_total - paid, status = Pending if paid = 0, Paid if remaining = 0, else Partial. The frontend only reads this view for status, so status can never be set manually.

Constraints: CHECK amount > 0; payment insert rejected if it would exceed remaining (enforced in a database function, not only the UI); unique (enrollment_id, date) on attendance; phone format check; triggers write audit_log on inserts/updates for all core tables; a trigger blocks DELETE on core tables.

## 4. Key database functions (RPC)

- add_payment(enrollment_id, amount, mode, txn_ref, idempotency_key): validates, checks remaining, generates receipt_no, inserts.
- cancel_payment(payment_id, reason): marks cancelled, logs.
- archive_student / restore_student, end_enrollment(enrollment_id).
- get_pending_for_reminders(scope, min_gap_days): returns currently unpaid students not reminded recently (n8n calls this right before sending).

## 5. n8n workflows (PROVISIONAL DRAFT)

Do not build these yet. This list is only a first idea of what automation will be needed. The CRM (database + dashboard) is finalised first; the final n8n workflows are designed after that, in Phase 3, and may change.

| ID | Trigger | Purpose |
| --- | --- | --- |
| WF-01 absent-alerts | Webhook (from dashboard) | Verify user, load absent students for a batch/date, skip already-notified, send approved attendance template, write message_log |
| WF-02 fee-reminder-single | Webhook | Verify user, re-check fees, send template, log |
| WF-03 fee-reminder-auto | Cron (daily) | Read reminder_settings; if today is the send day and enabled, loop students one by one with a delay, skip paid or recently reminded, log, post summary |
| WF-04 template-submit | Webhook | Convert {placeholders} to {{n}}, call Meta message_templates API (Utility), save status pending |
| WF-05 template-status-sync | Cron + Meta webhook | Update template status approved/rejected with reason |
| WF-06 wa-status-webhook | Meta webhook | Verify signature, update message_log (sent/delivered/read/failed) |
| WF-07 nightly-backup | Cron (night) | Export all tables to Google Drive (JSON/CSV), keep last N days |
| WF-08 keepalive | Cron (daily) | Light query to prevent Supabase pause |
| WF-09 lead-call | DB webhook or poll | Create VAPI call for new lead (Phase 6) |
| WF-10 error-handler | Error trigger | Notify the developer on any workflow failure |

## 6. API contracts (dashboard to n8n) (PROVISIONAL DRAFT)

Final contracts are decided together with the n8n workflows after the CRM is finalised.

All endpoints are POST on N8N_WEBHOOK_BASE_URL, JSON, with header Authorization: Bearer <Supabase user JWT>. n8n verifies the token against Supabase before acting, then uses its own service_role connection. Responses: { ok: true|false, data?, error? }.

| Endpoint | Payload |
| --- | --- |
| /send-absent-alerts | { batch_id, date, request_id } |
| /send-fee-reminder | { enrollment_id, template_id, due_date, request_id } |
| /submit-template | { template_id } |
| /run-auto-reminders-now (optional test) | { dry_run: true } |

request_id becomes the idempotency key: a retry with the same id never sends twice.

## 7. Messaging flows

Absent alert: teacher saves attendance (direct to Supabase) -> clicks "Notify parents" -> preview list -> confirm -> WF-01 -> Meta -> message_log sent -> Meta status webhook -> delivered/read/failed -> dashboard shows status.

Auto fee reminder: WF-03 cron -> get_pending_for_reminders -> for each student (one by one, delay between) -> re-check not paid -> send template with variables -> log -> summary.

Template approval: client writes text -> WF-04 -> Meta -> status sync -> dashboard shows approved/rejected.

## 8. Meta WhatsApp specifics

- Business-initiated messages require approved templates (Utility). Free text only inside the 24-hour window.
- Use a System User permanent token. Keep WA_VERIFY_TOKEN and WA_APP_SECRET.
- Webhook GET verification (hub.challenge) and POST signature check (X-Hub-Signature-256).
- Test number limits recipients; go-live needs Business Verification.
- Rate limits and per-message pricing apply; throttle sends.

## 9. Reliability

- Idempotency keys on payments, message_log and webhooks.
- Retry with backoff in n8n for transient Meta errors; permanent errors marked failed with reason.
- n8n uses a persistent Docker volume; save the n8 encryption key; export workflow JSON into Git.
- Dashboard CRUD does not depend on n8n.

## 10. Backup and recovery

Nightly export to Google Drive; manual export button; restore procedure written and tested once on the dev project before go-live. Supabase free tier does not provide downloadable daily backups (verify current terms).

## 11. Observability

n8n execution history, message_log failures view on the dashboard, error-handler alerts, weekly check that the backup file exists.

## 12. Deployment

Frontend: static deploy from Git. n8n: Docker Compose on a small VPS with HTTPS reverse proxy and fixed domain. Supabase: migrations applied by SQL files, never by hand on live.
