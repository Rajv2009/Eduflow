# EduFlow OS: Frontend Specification

## 1. Principles

- Vanilla HTML5/CSS/JS, `supabase-js` via CDN. No framework, no build step.
- Start from the existing prototype `coaching_crm.html` (keep its look and feel, sidebar layout, cards, modals, toast). It is not final and will change a lot.
- Mobile-first and responsive: the teacher will use a phone as much as a laptop. Tables become cards on small screens.
- Data comes only from Supabase (and n8n for messaging). No `localStorage` as storage.
- All rendered text is escaped. Every action shows loading, success or error.

## 2. File structure

/index.html        shell, sidebar, page containers, modals
/login.html        staff login
/css/style.css     styles from the prototype, cleaned up
/js/config.js      SUPABASE_URL, SUPABASE_ANON_KEY, N8N_WEBHOOK_BASE_URL (public values only)
/js/api.js         all Supabase and n8n calls in one place
/js/ui.js          toast, modal, confirm dialog, loading/empty/error helpers
/js/pages/*.js     one file per page (classes, students, fees, attendance, templates, settings, leads, dashboard)
/js/app.js         router (showPage), auth guard, init

## 3. Navigation (sidebar)

- Dashboard, Classes & Batches (new), Students, Fees, Attendance, Messages (log), Message Templates (new), Settings (reminders, backup/export), Leads (last stage).
- Static for now: Academic, Parents, Agents, Alerts, Call Log (hide or mark "Coming soon").

## 4. Element ID convention

- Keep existing prototype IDs where they exist: `page-*`, `leadsTable`, `studentsTable`, `leadSearch`, `globalSearch`, `toastContainer`, `addLeadModal`, `addStudentModal`, `markAttendanceModal`, `sendWhatsappModal`, `studentDetailModal`, `leadDetailModal`.
- Every form input gets an ID: `<form>-<field>`, camelCase, e.g. `addStudent-name`, `addStudent-parentPhone`, `addStudent-classId`, `addStudent-batchId`, `addStudent-fee`, `addPayment-amount`. New tables follow `<entity>Table` (e.g. `feesTable`, `batchesTable`, `templatesTable`).

## 5. Global components

- **Class then Batch dropdown pair** (DB driven; batch list depends on class).
- **Fee badge**: 🔴 Pending, 🟡 Partial, 🟢 Paid (read from the `enrollment_fees` view only).
- **Confirm dialog** (reusable) with a summary block and Confirm/Cancel.
- **Undo toast** after archive actions.
- **Status chip** for messages: Sent, Delivered, Read, Failed (+ Retry), Template: Pending/Approved/Rejected.
- **Empty state**, **skeleton/loading**, **error banner with Retry** on every list.
- **Search + filter bar** (class, batch, status).
- Buttons disable during requests to prevent double submits.

## 6. Pages

### 6.1 Login

- Email + password, error message, no sign-up link.

### 6.2 Dashboard

- Cards: total active students, total fee pending (sum of remaining), students with Pending/Partial, messages sent today, failed messages. Recent activity list. Keep it simple; all values from queries/views.

### 6.3 Classes & Batches

- Left: class list with Add class, Rename, Archive. Right: batches of selected class with Add batch (name, default fee, timing note, subject checkboxes), Edit, Archive.
- Subject manager: add a subject name inline.
- "Show archived" toggle with Restore.

### 6.4 Students

- Filters: class, batch, fee status, search by name/parent phone. Table `studentsTable`: Name, Class/Batch, Parent name, Parent number, Joined, Fee badge, Actions (View, Send Reminder, Archive).
- **Add student modal:** name, parent name, parent WhatsApp number (10-digit, saved as 91XXXXXXXXXX), class, batch, enrollment date, fee (default from batch, editable), consent tick (parent agreed to messages). Duplicate warnings for same name in batch or same phone.
- **Student detail (`studentDetailModal`):** enrollment date, parent details, fee summary (Total, Paid, Remaining, badge), payment history with cancelled entries visible, "Add payment", message history, "Remove from batch" (archive, undo).

### 6.5 Fees

- Table `feesTable`: Student, Batch, Total, Paid, Remaining, Status, Last payment, Actions (Add payment, Send Reminder).
- **Add payment flow:** form (amount, mode cash/UPI, date, optional UPI reference) then **confirm screen** showing name, class/batch, parent name, last 4 digits of parent phone, amount, mode, resulting remaining. Client-side checks mirror database rules (amount > 0, not above remaining, duplicate warning).
- **Cancel payment:** reason required, original stays visible as Cancelled.
- No "mark as paid" control anywhere.

### 6.6 Attendance

- Pick class, batch, date (default today). List of students with Present/Absent toggle (default Present), "Save attendance".
- After saving: "Notify parents of absent students" opens a preview list (name, parent number, template) with Confirm. Shows per-student result (Sent/Failed). Already-notified students are marked and skipped.

### 6.7 Messages (log)

- Table: time, student, type, status chip, error, Retry. Filter by status and date.

### 6.8 Message Templates

- List with name, preview, status chip, rejection reason.
- Editor: name, language, message body with placeholder buttons ({student_name}, {parent_name}, {total}, {paid}, {pending}, {due_date}, {months_since_joining}), live preview with sample values, hint "Keep it polite; threatening wording may be rejected."
- "Submit for approval" (calls n8n). Only Approved templates appear in send dialogs.

### 6.9 Settings

- **Auto fee reminders:** ON/OFF toggle, day of month, time, scope (all / class / batch), pay-by date, template, minimum gap between reminders, "Preview who will get a message" and "Send now" (with confirm).
- **Data:** "Export data" button, last backup time.

### 6.10 Leads (last stage)

- `leadsTable` and `addLeadModal` become dynamic; status chips; call outcome shown after the AI call.

## 7. Send Reminder dialog (`sendWhatsappModal`)

- Shows approved template choice, preview filled with the student's real numbers, pay-by date input, parent name and last 4 digits of phone, Confirm. Secondary link: "Send from my WhatsApp" (wa.me with prefilled editable text).

## 8. Validation rules

- Name required; phone must be 10 digits starting 6-9; amounts positive numbers with max 2 decimals; dates valid; class/batch required; fee non-negative; disabled submit until valid. Error text sits under the field.

## 9. States and errors

- Every list: loading, empty ("No students yet. Add your first student"), error ("Could not load. Retry"). Network failure on send: show Failed, never show Sent. Session expired: redirect to login.

## 10. Prototype migration notes

- Replace all hardcoded `<tr>` rows with rendered data.
- Replace hardcoded class/batch selects with DB-driven selects.
- Move inline `<script>` to `/js`.
- Prototype implies voice calls for absence; change to WhatsApp message.
- Keep visual style (colors, cards, modals, toast) unless a later design pass says otherwise.

## 11. Accessibility and language

- Readable font sizes, sufficient contrast, tap targets at least 44px, labels on inputs. UI in English with simple wording; Hindi labels can be added later.
