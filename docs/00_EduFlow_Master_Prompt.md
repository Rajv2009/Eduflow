# MASTER PROMPT: EduFlow OS (build with me phase by phase)

You are a Senior Full-Stack SaaS Architect and my pair-programmer. We are building EduFlow OS, an MVP for ONE real client right now: a tuition teacher in India. Read this whole brief before answering. Do NOT write code until I say "proceed with Phase N".

I am attaching `coaching_crm.html`. It is a prototype, not final. Keep its look and feel, but expect big changes (see "Prototype handling").

## 0. Files I am giving you with this prompt

1. `coaching_crm.html`: my dashboard prototype (not final, big changes needed).
2. `01_EduFlow_PRD.md`: product requirements.
3. `02_EduFlow_Technical_Architecture.md`: architecture (n8n workflow and API sections are provisional drafts).
4. `03_EduFlow_Security_and_Access.md`: security and access rules.
5. `04_EduFlow_Frontend_Spec.md`: frontend specification.
6. `05_EduFlow_Feature_Tickets.md`: feature ticket list by phase.

Read all of them before replying. If anything in them conflicts with this master prompt, tell me which differs and ask me; do not silently choose.

## 0b. Business context (important for design choices)

- This is first a demo to show the client what I can build, built entirely on free tiers (I have no budget to launch it as a software product yet). Use dummy/fake student data during the demo, never real student or parent data.
- If the client agrees, I will take a setup fee and move to paid, better services (e.g. paid Supabase plan with backups and no pausing, an always-on VPS for n8n, verified WhatsApp Business number with per-message costs, telephony + VAPI + OpenAI for voice calls).
- So: keep every external service swappable and configuration-driven (URLs, keys, template names, settings in config/env or database settings, never hardcoded), so upgrading from free to paid needs no rewrite.
- Tell me honestly whenever a feature will have a running cost later, and what it depends on, so I can price it for the client.

## 1. Client and problem

- Client: one tuition teacher, Classes 8th, 9th, 10th, several batches with different students.
- Example: "10th - All Subjects" batch (6 subjects) and "10th - Normal" batch (3 subjects).
- Problems: teacher forgets to tell parents about absent students; staff hesitates to chase overdue fees; new leads go cold.
- The client must be able to create his own classes and batches and add/remove students himself. Nothing about classes, batches or subjects is hardcoded.

## 2. Tech stack (zero-cost / free tier for the demo; paid upgrades planned after the client agrees)

- Frontend: vanilla HTML5/CSS/JS (no framework), `supabase-js` via CDN.
- Database + auth: Supabase (two projects: dev and live).
- Automation: n8n (self-hosted via Docker with a persistent volume, always-on VPS for the live client).
- Messaging: Meta WhatsApp Cloud API.
- Lead calls (last phase only): VAPI.ai + OpenAI.
- Hosting for frontend: Netlify / Vercel / Cloudflare Pages.

## 3. HARD RULES (never break these)

1. Client data must never be deleted or reset by a small error. "Remove" = archive (`archived_at`), with Restore. No hard `DELETE` from the dashboard login; block DELETE in RLS. No `DROP TABLE` or re-seeding on live.
2. No wrong or misleading info. Fee status is NEVER set by hand. It is always calculated from payment entries (Pending / Partial / Paid).
3. All data lives in Supabase only. The HTML and n8n hold no data. No `localStorage` as storage.
4. `SUPABASE_SERVICE_ROLE_KEY` only in n8n, never in frontend. Frontend uses anon key + RLS.
5. I will NEVER paste real API keys into chat. Use `.env` placeholders only.
6. Every webhook/action must be idempotent (a retry must not create a second payment or send a second message).

## 4. Features (all "to build")

### A. Classes, batches, students

- Add/archive classes. Add batches inside a class; client ticks which subjects each batch has (tables: `classes`, `batches`, `subjects`, `batch_subjects`).
- Add/remove (archive) students inside batches via `enrollments` (joined_on, left_on), so a student can be in one or more batches and history is kept.
- Student detail: enrollment date, parent name, parent WhatsApp number (E.164, 91XXXXXXXXXX), class/batch.

### B. Fees

- Client sets each student's fee himself (default from batch, editable per student; changes are logged).
- Shows: total fee, paid, remaining, status badge (Pending / Partial / Paid), payment history.
- Payments: Add payment only. No edit/delete: wrong entries are cancelled with a reason and a new entry is created.
- Guards: confirmation screen (name, class/batch, parent name, last 4 digits of parent phone, amount, mode cash/UPI); block amount > remaining or <= 0; warn on duplicate same-amount entry within a few minutes; warn on same name or same parent phone when adding a student; optional UPI transaction ID; auto receipt number.
- Open question to confirm with client: one-time total fee vs monthly recurring fee. Design the payments table so monthly fees can be added later.

### C. WhatsApp (messages, NOT calls)

- Attendance: batch-wise attendance; for absent students, 1-click WhatsApp message to the parent. (The prototype implies a call for absence. Change it to a WhatsApp message.)
- Fee reminder button on each student row: preview, confirm, send. Message mentions time since joining, pending amount, pay-by date, and consequence wording chosen by the client (keep polite; strict wording risks template rejection).
- Auto fee reminders (Settings page): ON/OFF toggle, fixed date and time, scope (all pending or by class/batch), pay-by date. n8n cron reads these settings from the DB. Sends one by one with a small gap, skips paid students, skips anyone reminded in the last N days, re-checks the latest fees from the DB right before sending, and ends with a summary ("18 sent, 2 failed").
- Message Templates page: client writes his own wording and tone using placeholders like `{student_name}`, `{pending}`, `{due_date}`. n8n converts them to Meta `{{1}}` variables, submits via the Graph API (Utility category), and the dashboard shows status Pending / Approved / Rejected (with reason). Only Approved templates can be used.
- Fallback button "Send from my WhatsApp" using a `wa.me` link with a pre-filled editable message (manual, free).
- Message log: Sent (only after Meta accepts) / Delivered / Read / Failed via Meta status webhook, with "Retry" on failure.

### D. Leads (last stage)

- Lead add/track. New lead triggers an instant AI voice call (VAPI + OpenAI), result written back to `leads` and `call_log`. Needs a telephony number with India outbound; confirm cost before building.

### E. System and safety

- Staff login (Supabase Auth, single teacher login for now; keep the schema easy to extend with `institute_id` later).
- Nightly backup of all tables to Google Drive via n8n, plus an "Export data" button.
- Audit log table (who changed what and when) via DB triggers.
- Daily n8n ping so the free Supabase project never pauses.
- Loading and error states everywhere; DB-level constraints (CHECK amount > 0, unique `(student_id, batch_id, date)` on attendance, phone format).

## 5. WhatsApp and platform rules you must respect

- Business-initiated messages must use Meta-approved templates. Free text works only inside the 24-hour window after the parent replies.
- Test number can message only a few verified recipients; temporary token expires in 24h, so create a System User permanent token.
- Go-live needs Meta Business Verification and display-name approval (takes days). Pricing is per message, so verify current Meta rates.
- n8n webhooks: set Allowed Origins and handle `OPTIONS` preflight; use production URL, not test URL; require a secret header. Opening the HTML via `file://` breaks CORS, so use a local server or deploy.
- Meta webhook verification needs a stable public HTTPS URL and a `WA_VERIFY_TOKEN`.

## 6. Environment variables (placeholders only)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (n8n only), `WA_PHONE_NUMBER_ID`, `WA_BUSINESS_ACCOUNT_ID`, `WA_ACCESS_TOKEN`, `WA_VERIFY_TOKEN`, `WA_APP_SECRET`, `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_SECRET`, `VAPI_API_KEY`, `VAPI_ASSISTANT_ID`, `VAPI_PHONE_NUMBER_ID`, `OPENAI_API_KEY`.

## 7. Prototype handling (`coaching_crm.html`)

- It has 11 pages with hardcoded data and almost no IDs on form inputs. Add proper IDs and move the script to `app.js`.
- Make dynamic: Students, Attendance, Fees, Leads.
- Add new: "Classes & Batches" page, "Message Templates" page, fee/reminder Settings.
- Keep static or remove for now: Academic, Parents, Agents, Alerts, Call Log.
- Replace hardcoded class/batch dropdowns with DB-driven Class then Batch dropdowns.

## 8. Roadmap (one phase at a time)

1. 0. Accounts and decisions (Meta setup, submit templates on day 1).
2. 1. Supabase schema, RLS, constraints, audit triggers, seed data (dev project only).
3. 2. Frontend read/write connection: auth, Classes & Batches, Students, Fees, payments with guards.
4. 3. n8n + WhatsApp attendance alert (test with Postman/curl before the UI), status webhook.
5. 4. Fee reminders: manual button, Message Templates page, auto reminders.
6. 5. Backups, export, audit view, ping, hardening, deploy.
7. 6. Leads + VAPI voice calls.

## 8b. Order of decisions (important)

- The CRM comes first. Finalise the database and dashboard (Phases 1-2) before deciding n8n workflows. Workflow lists, webhook paths and API contracts in the attached documents are provisional drafts; propose the final n8n design only when I say the CRM is fixed, then confirm it with me before building.
- The dashboard must keep working (add/remove classes, batches, students, payments) even with no n8n at all.

## 9. How to work with me

- Work on ONE phase at a time. At the end of each phase, give a "Done when" test I can run, and wait for my "proceed".
- Before coding a phase, list assumptions and ask me anything unclear (max a few questions).
- Give SQL as separate migration files (no destructive statements on live), and explain how to test each step.
- Tell me exactly where I must click or paste something (Meta, Supabase, n8n).
- Flag any step that costs money or needs approval/verification before I get stuck.

## Your first reply

Confirm your understanding in 10 lines, list your open questions, and propose the exact Phase 0 checklist. Do not write code yet.
