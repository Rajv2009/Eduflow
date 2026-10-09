# EduFlow OS: Security and Access Document

## 1. What we protect

- Student records (minors) and parent phone numbers.
- Fee and payment records.
- WhatsApp, Supabase and VAPI credentials.
- Integrity: no wrong, lost or reset data.

## 2. Roles

| Role | Who | Access |
| --- | --- | --- |
| owner | The teacher | Read/insert/update through the app. No DELETE. |
| developer | You | Supabase dashboard + n8n admin, outside the app. Only role that can hard-delete (on a written request, see section 8). |
| service (n8n) | Automation | Uses service_role key, stored only in n8n credentials. |
| parent | None | No login. Receives messages only. |

Only one teacher login for now; design policies so more staff roles can be added later.

## 3. Row Level Security matrix (owner role)

| Table | Select | Insert | Update | Delete |
| --- | --- | --- | --- | --- |
| classes, subjects, batches, batch_subjects | yes | yes | yes (incl. archive) | no |
| students, enrollments | yes | yes | yes (incl. archive) | no |
| payments | yes | only via `add_payment` | only via `cancel_payment` | no |
| attendance | yes | yes | yes (logged) | no |
| message_templates, reminder_settings | yes | yes | yes | no |
| message_log, call_log | yes | no (n8n writes) | no | no |
| audit_log | yes | no (triggers write) | no | no |
| leads | yes | yes | yes | no |

RLS is enabled on every table. A table with RLS on and no policy returns nothing, so test each policy. DELETE is blocked both by policy and by a trigger.

## 4. Authentication and sessions

- Supabase Auth, email + strong password (consider adding a second factor later).
- Disable public sign-ups; the teacher's account is created by you.
- Short-lived access tokens with refresh; log out button; auto logout on long idle.
- Password reset only through Supabase email flow.

## 5. Secrets and keys

| Secret | Where it may live |
| --- | --- |
| `SUPABASE_ANON_KEY`, `SUPABASE_URL` | Frontend (safe, protected by RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | n8n credentials only. Never in HTML, Git or chat. |
| WhatsApp token, app secret, verify token | n8n credentials only |
| VAPI and OpenAI keys | n8n credentials only |

- `.env` files and credentials are never committed (use `.gitignore`).
- Never paste real keys into any AI chat; use placeholders.
- Rotate keys if ever exposed. Use separate keys for dev and live.

## 6. Webhook and API security

- Dashboard to n8n: `Authorization: Bearer <user JWT>`; n8n verifies it with Supabase before doing anything. Requests without a valid owner token are rejected.
- Meta to n8n: verify GET challenge with `WA_VERIFY_TOKEN`; verify POST signature `X-Hub-Signature-256` using `WA_APP_SECRET`.
- Internal cron/webhooks protected by `N8N_WEBHOOK_SECRET` header.
- n8n webhook "Allowed Origins" limited to the real dashboard domain; handle `OPTIONS` preflight; HTTPS only.
- Basic rate limiting on n8n (reverse proxy) and a cap on messages per run.
- Validate every input (phone, amount, ids) in the database, not only the browser.

## 7. Data integrity controls

- Fee status derived from payments, never typed.
- Payments are immutable; cancel with reason.
- Idempotency keys on payments, messages and webhooks.
- `audit_log` records who, what, when for core tables.
- Dashboard login cannot delete; Supabase admin access only with you.
- Dev and live projects are separate.

## 8. Privacy and compliance (India)

This product handles children's data and phone numbers. India's Digital Personal Data Protection Act, 2023 is relevant; confirm exact obligations with a qualified lawyer before launch.

- Collect only what is needed (name, class/batch, parent name and phone, fee records).
- Keep a `parent_opt_in` flag and message only opted-in parents; include a way for a parent to say stop.
- The teacher is the data owner; you act as the processor. Have a short written agreement/terms with the teacher.
- Deletion requests: because the app never hard-deletes, a verified request is handled by you as developer (purge or anonymise), after an export for the teacher.
- Do not use student data for any other purpose or share with third parties beyond Meta, Supabase, n8n host, VAPI/OpenAI (Phase 6).

## 9. Infrastructure security

- VPS: SSH keys only, firewall, automatic security updates, HTTPS via reverse proxy, n8n behind basic auth/owner login, regular image updates.
- Persistent n8n volume and saved encryption key.
- Backups stored in a private Google Drive folder with limited sharing; restore tested once.
- Supabase: enable email confirmation, restrict API access where possible, review auth logs.

## 10. Frontend security

- No secrets in client code. Escape all rendered user text (no raw `innerHTML` with user data) to prevent XSS.
- Confirm screens for money-related actions. Buttons disabled while a request is in progress to stop double submits.
- Content Security Policy where possible; only load scripts from trusted CDNs with pinned versions.

## 11. Incident response

1. If a key leaks: rotate it immediately, check n8n and message logs for misuse.
2. If wrong data appears: check `audit_log`, cancel/correct through the app, restore from the last backup only if needed (to a separate project first).
3. If WhatsApp quality drops or number is flagged: pause auto reminders, review templates and opt-in list.
4. Write down what happened and what changed.

## 12. Pre-launch security checklist

- [ ] RLS on for all tables, policies tested with the owner account
- [ ] DELETE blocked (policy + trigger) and verified
- [ ] Service-role key absent from frontend and Git
- [ ] Webhook auth (JWT, Meta signature, secret) tested with bad tokens
- [ ] Sign-ups disabled, strong password set
- [ ] Backup created and a restore tested
- [ ] Dev and live keys separate
- [ ] Opt-in recorded for every parent number used
