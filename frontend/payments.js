// EduFlow OS — payments.js (Step 3 fb: Add payment + Edit payment modals)
// Add: form -> confirm screen (name, class/batch, parent, last 4 phone,
// amount, remaining after) -> rpc('add_payment') with a FRESH idempotency
// key per opened form. Edit: date/amount/note via rpc('edit_payment');
// DB keeps the old entry as "Corrected" (never deleted).

(function () {
  "use strict";

  if (typeof sb === "undefined" || !sb) return;

  const $ = (id) => document.getElementById(id);
  const E = () => window.EDU || {};

  const state = {
    row: null,
    idemKey: null,
    busy: false,
    editPayId: null,
  };

  function money(v) { return (E().money || function (x) { return "₹" + Number(x || 0); })(v); }
  function plainError(err) { return (E().plainError || function (e) { return (e && e.message) || "Kuch galat ho gaya."; })(err); }
  function toast(msg, type) { return (E().showToast || function () {})(msg, type); }

  function setBusy(btn, busy, busyText, normalText) {
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? busyText : normalText;
  }

  function last4(p) {
    const d = String(p || "").replace(/\D/g, "");
    return d.length >= 4 ? ("****" + d.slice(-4)) : "—";
  }

  function todayIST() {
    const now = new Date();
    const ist = new Date(now.getTime() + (5 * 60 + 30) * 60000);
    return ist.toISOString().slice(0, 10);
  }

  // ---------- open/close ----------
  function openAddPay(row) {
    state.row = row;
    state.idemKey = crypto.randomUUID();
    showFormView();
    $("addPayAmount").value = "";
    $("addPayDate").value = todayIST();
    $("addPayDate").max = todayIST();
    $("addPayMode").value = "cash";
    $("addPayTxnRef").value = "";
    $("addPayNote").value = "";
    const err = $("addPayError");
    err.textContent = "";
    err.classList.remove("show");
    $("addPayOverlay").classList.add("open");
    $("addPayAmount").focus();
  }

  function showFormView() {
    $("addPayFormView").style.display = "block";
    $("addPayConfirmView").style.display = "none";
  }

  function showConfirmView() {
    $("addPayFormView").style.display = "none";
    $("addPayConfirmView").style.display = "block";
  }

  function closeAddPay() {
    $("addPayOverlay").classList.remove("open");
    state.row = null;
    state.idemKey = null;
  }

  // ---------- add: form -> confirm ----------
  function onConfirmClick(e) {
    e.preventDefault();
    const err = $("addPayError");
    err.textContent = "";
    err.classList.remove("show");

    const amount = Number($("addPayAmount").value);
    const date = $("addPayDate").value;

    if (!Number.isFinite(amount) || amount <= 0) {
      err.textContent = "Amount 0 se upar honi chahiye";
      err.classList.add("show");
      return;
    }
    if (!date) {
      err.textContent = "Date chuniye (aaj se aage nahi)";
      err.classList.add("show");
      return;
    }
    if (date > todayIST()) {
      err.textContent = "Aaj se aage ki date nahi chalti";
      err.classList.add("show");
      return;
    }

    const row = state.row;
    if (!row) return;

    $("apcName").textContent = row.student_name;
    $("apcClassBatch").textContent = row.class_name + " / " + row.batch_name;
    $("apcParent").textContent = row.parent_name || "—";
    $("apcPhone").textContent = row.parent_phone ? last4(row.parent_phone) : "—";
    $("apcAmount").textContent = money(amount);
    const remainingAfter = Math.max(0, Number(row.remaining || 0) - amount);
    $("apcRemaining").textContent = money(remainingAfter);

    showConfirmView();
  }

  async function onSavePayment(e) {
    e.preventDefault();
    if (state.busy) return;
    state.busy = true;
    const btn = $("savePaymentBtn");
    setBusy(btn, true, "Saving...", "Save Payment");
    const errBox = $("addPayConfirmError");
    errBox.textContent = "";
    errBox.classList.remove("show");

    try {
      const params = {
        p_enrollment_id: state.row.enrollment_id,
        p_amount: Number($("addPayAmount").value),
        p_mode: $("addPayMode").value,
        p_paid_on: $("addPayDate").value || null,
        p_txn_ref: $("addPayTxnRef").value.trim() || null,
        p_idempotency_key: state.idemKey,
      };

      const res = await sb.rpc("add_payment", params);
      if (res.error) throw res.error;
      const out = res.data || {};
      toast(out.duplicate ? "Payment pehle se saved hai (duplicate)" : "Payment save ho gayi", "success");
      closeAddPay();
      if (window.EDU_PROFILE && window.EDU_PROFILE.refreshCurrent) await window.EDU_PROFILE.refreshCurrent();
    } catch (err) {
      errBox.textContent = plainError(err);
      errBox.classList.add("show");
    } finally {
      state.busy = false;
      setBusy(btn, false, "", "Save Payment");
    }
  }

  // ---------- edit payment ----------
  function openEditPay(p) {
    state.editPayId = p.id;
    $("editPaySub").textContent = money(p.amount) + " • Receipt " + (p.receipt_no || "—");
    $("editPayDate").value = String(p.paid_on || "").slice(0, 10);
    $("editPayDate").max = todayIST();
    $("editPayAmount").value = Number(p.amount || 0);
    $("editPayNote").value = p.note || "";
    const err = $("editPayError");
    err.textContent = "";
    err.classList.remove("show");
    $("editPayOverlay").classList.add("open");
    $("editPayAmount").focus();
  }

  async function onSaveEditPay(e) {
    e.preventDefault();
    if (state.busy) return;
    const errBox = $("editPayError");
    errBox.textContent = "";
    errBox.classList.remove("show");

    const amount = Number($("editPayAmount").value);
    const date = $("editPayDate").value;
    const note = $("editPayNote").value.trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      errBox.textContent = "Amount 0 se upar honi chahiye";
      errBox.classList.add("show");
      return;
    }
    if (!date) {
      errBox.textContent = "Date chuniye";
      errBox.classList.add("show");
      return;
    }
    if (date > todayIST()) {
      errBox.textContent = "Aaj se aage ki date nahi chalti";
      errBox.classList.add("show");
      return;
    }

    state.busy = true;
    const btn = $("saveEditPayBtn");
    setBusy(btn, true, "Saving...", "Save");

    try {
      const res = await sb.rpc("edit_payment", {
        p_payment_id: state.editPayId,
        p_amount: amount,
        p_paid_on: date,
        p_note: note || null,
      });
      if (res.error) throw res.error;
      toast("Payment update ho gayi — purani entry Corrected bankar dikhegi", "success");
      $("editPayOverlay").classList.remove("open");
      if (window.EDU_PROFILE && window.EDU_PROFILE.refreshCurrent) await window.EDU_PROFILE.refreshCurrent();
    } catch (err) {
      errBox.textContent = plainError(err);
      errBox.classList.add("show");
    } finally {
      state.busy = false;
      setBusy(btn, false, "", "Save");
    }
  }

  // ---------- events ----------
  function bind() {
    $("closeAddPayBtn").addEventListener("click", closeAddPay);
    $("cancelAddPayBtn").addEventListener("click", closeAddPay);
    $("addPayForm").addEventListener("submit", onConfirmClick);
    $("backAddPayBtn").addEventListener("click", showFormView);
    $("savePaymentBtn").addEventListener("click", onSavePayment);

    $("closeEditPayBtn").addEventListener("click", function () { $("editPayOverlay").classList.remove("open"); });
    $("cancelEditPayBtn").addEventListener("click", function () { $("editPayOverlay").classList.remove("open"); });
    $("editPayForm").addEventListener("submit", onSaveEditPay);
  }

  bind();

  window.EDU_PAYMENTS = {
    openAddPay: openAddPay,
    openEditPay: openEditPay,
    todayIST: todayIST,
    last4: last4,
  };
})();
