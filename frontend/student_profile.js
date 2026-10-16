// EduFlow OS — student_profile.js (Step 3: Student Profile modal)
// Rules: client = sb, textContent only, no delete. Payments only via
// rpc('cancel_payment'). Fee edit = plain enrollments update (DB blocks
// going below paid — that error is shown in plain Hinglish).
// Move = rpc('move_student'). Remove from batch = rpc('end_enrollment').

(function () {
  "use strict";

  if (typeof sb === "undefined" || !sb) return;

  const $ = (id) => document.getElementById(id);
  const S = () => window.EDU_STUDENTS || {};

  const state = {
    row: null,
    payments: [],
    busy: false,
    cancelPayId: null,
  };

  function money(v) { return (S().money || ((x) => "₹" + Number(x || 0).toFixed(2)))(v); }
  function fmtDate(d) { return (S().fmtDate || ((x) => x || "—"))(d); }
  function plainError(err) { return (S().plainError || ((e) => "Kuch galat ho gaya. Dobara try karo."))(err); }
  function showToast(m, t) { return (S().showToast || (() => {}))(m, t); }
  function setBusy(btn, busy, busyText, normalText) {
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? busyText : normalText;
  }

  function feeErrHinglish(err) {
    const m = String((err && err.message) || "");
    if (m.includes("cannot go below")) {
      return "Nayi fee paid amount se kam nahi ho sakti. Total paid amount se upar ya barabar rakho.";
    }
    return plainError(err);
  }

  function clearNode(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

  // ---------- open ----------
  async function openProfile(row) {
    state.row = row;
    $("profileTitle").textContent = row.student_name;
    $("profileSub").textContent = row.student_code + " • " + row.class_name + " • " + row.batch_name;

    // stat boxes
    const attEl = $("pfAttPercent");
    if (row.attendance_percent === null || row.attendance_percent === undefined) {
      attEl.textContent = "—";
      attEl.className = "stat-box-val";
    } else {
      const p = Number(row.attendance_percent);
      attEl.textContent = p.toFixed(0) + "%";
      attEl.className = "stat-box-val " + (p >= 75 ? "ok" : (p >= 50 ? "warn" : "bad"));
    }

    const feeEl = $("pfFeeStatus");
    if (row.fee_status === "paid") { feeEl.textContent = "Paid"; feeEl.className = "stat-box-val ok"; }
    else if (row.fee_status === "partial") { feeEl.textContent = "Partial"; feeEl.className = "stat-box-val warn"; }
    else if (row.fee_status === "pending") { feeEl.textContent = "Pending"; feeEl.className = "stat-box-val bad"; }
    else { feeEl.textContent = "Not set"; feeEl.className = "stat-box-val"; }

    const remEl = $("pfFeeStatus").parentElement.querySelector(".stat-box-label");
    remEl.textContent = "Fee Status" + (row.remaining > 0 ? " (" + money(row.remaining) + " remaining)" : "");

    const daysEl = $("pfDays");
    daysEl.textContent = (row.present_days ?? "—") + " / " + (row.total_days ?? "—");

    // details
    $("pfClass").textContent = row.class_name || "—";
    $("pfBatch").textContent = row.batch_name || "—";
    $("pfJoined").textContent = fmtDate(row.enrollment_date);
    $("pfFeeTotal").textContent = row.fee_status === "not_set" ? "Not set" : money(row.fee_total);
    $("pfPaid").textContent = money(row.paid);
    $("pfRemaining").textContent = money(row.remaining);

    // parent
    $("pfParentName").textContent = row.parent_name || "—";
    $("pfParentPhone").textContent = row.parent_phone || "—";
    const opt = $("pfOptIn");
    opt.textContent = row.parent_phone ? (row.parent_opt_in ? "Yes" : "No") : "—";
    opt.style.color = row.parent_opt_in ? "var(--success)" : "";

    // payments
    clearNode($("pfPayList"));
    const loadBox = document.createElement("div");
    loadBox.className = "empty-state";
    loadBox.style.padding = "12px";
    loadBox.textContent = "Payments load ho rahe hain...";
    $("pfPayList").appendChild(loadBox);

    $("profileModalOverlay").classList.add("open");

    try {
      const res = await sb.from("payments")
        .select("id, amount, paid_on, mode, txn_ref, receipt_no, status, cancelled_reason")
        .eq("enrollment_id", row.enrollment_id)
        .order("paid_on", { ascending: false });
      if (res.error) throw res.error;
      state.payments = res.data || [];
      renderPayments();
    } catch (err) {
      clearNode($("pfPayList"));
      const e = document.createElement("div");
      e.className = "empty-state";
      e.style.padding = "12px";
      e.textContent = "Payments load fail: " + plainError(err);
      $("pfPayList").appendChild(e);
    }
  }

  function renderPayments() {
    const host = $("pfPayList");
    clearNode(host);
    if (!state.payments.length) {
      const e = document.createElement("div");
      e.className = "empty-state";
      e.style.padding = "12px";
      e.textContent = "Abhi tak koi payment nahi hui.";
      host.appendChild(e);
      return;
    }
    state.payments.forEach((p) => {
      const item = document.createElement("div");
      item.className = "pay-item" + (p.status === "cancelled" ? " cancelled" : "");

      const amt = document.createElement("span");
      amt.className = "pay-amt";
      amt.textContent = money(p.amount);

      const meta = document.createElement("span");
      meta.className = "pay-meta";
      let m = fmtDate(p.paid_on) + " • " + (p.mode || "cash").toUpperCase() + " • " + (p.receipt_no || "—");
      if (p.txn_ref) m += " • " + p.txn_ref;
      if (p.status === "cancelled") m += " • Cancelled: " + (p.cancelled_reason || "");
      meta.textContent = m;

      const badge = document.createElement("span");
      if (p.status === "cancelled") { badge.className = "badge badge-muted"; badge.textContent = "Cancelled"; }
      else { badge.className = "badge badge-success"; badge.textContent = "Active"; }

      item.appendChild(amt);
      item.appendChild(meta);
      item.appendChild(badge);

      if (p.status === "active") {
        const cbtn = document.createElement("button");
        cbtn.className = "btn btn-secondary btn-sm pay-cancel-btn";
        cbtn.type = "button";
        cbtn.textContent = "Cancel";
        cbtn.addEventListener("click", () => openCancelPay(p));
        item.appendChild(cbtn);
      }

      host.appendChild(item);
    });
  }

  // ---------- Cancel payment ----------
  function openCancelPay(p) {
    state.cancelPayId = p.id;
    $("cancelPaySub").textContent = money(p.amount) + " • Receipt " + (p.receipt_no || "—");
    $("cancelPayReasonInput").value = "";
    const err = $("cancelPayError");
    err.textContent = "";
    err.classList.remove("show");
    $("cancelPayOverlay").classList.add("open");
    $("cancelPayReasonInput").focus();
  }

  async function saveCancelPay(e) {
    e.preventDefault();
    if (state.busy) return;
    const reason = $("cancelPayReasonInput").value.trim();
    const errBox = $("cancelPayError");
    errBox.textContent = "";
    errBox.classList.remove("show");
    if (reason.length < 3) {
      errBox.textContent = "Kam se kam 3 letters ka reason likho";
      errBox.classList.add("show");
      return;
    }
    const btn = $("saveCancelPayBtn");
    setBusy(btn, true, "Cancelling...", "Cancel Payment");
    state.busy = true;
    try {
      const res = await sb.rpc("cancel_payment", { p_payment_id: state.cancelPayId, p_reason: reason });
      if (res.error) throw res.error;
      showToast("Payment cancel ho gayi", "success");
      $("cancelPayOverlay").classList.remove("open");
      await refreshCurrent();
    } catch (err) {
      errBox.textContent = plainError(err);
      errBox.classList.add("show");
    } finally {
      state.busy = false;
      setBusy(btn, false, "", "Cancel Payment");
    }
  }

  // ---------- Fee edit ----------
  function openFeeEdit() {
    if (!state.row) return;
    $("feeEditInput").value = Number(state.row.fee_total || 0).toFixed(2);
    $("feeEditHint").textContent = "Abhi tak paid: " + money(state.row.paid) + ". Nayi fee isse kam nahi ho sakti.";
    const err = $("feeEditError");
    err.textContent = "";
    err.classList.remove("show");
    $("feeEditOverlay").classList.add("open");
    $("feeEditInput").focus();
  }

  async function saveFeeEdit(e) {
    e.preventDefault();
    if (state.busy || !state.row) return;
    const errBox = $("feeEditError");
    errBox.textContent = "";
    errBox.classList.remove("show");
    const raw = $("feeEditInput").value.trim();
    const fee = Number(raw);
    if (!Number.isFinite(fee) || fee < 0) {
      errBox.textContent = "Fee 0 ya usse upar honi chahiye";
      errBox.classList.add("show");
      return;
    }
    const btn = $("saveFeeEditBtn");
    setBusy(btn, true, "Saving...", "Save");
    state.busy = true;
    try {
      const res = await sb.from("enrollments").update({ fee_total: fee }).eq("id", state.row.enrollment_id);
      if (res.error) throw res.error;
      showToast("Fee update ho gayi", "success");
      $("feeEditOverlay").classList.remove("open");
      await refreshCurrent();
    } catch (err) {
      errBox.textContent = feeErrHinglish(err);
      errBox.classList.add("show");
    } finally {
      state.busy = false;
      setBusy(btn, false, "", "Save");
    }
  }

  // ---------- Move student ----------
  function openMoveModal() {
    if (!state.row) return;
    const err = $("moveStudentError");
    err.textContent = "";
    err.classList.remove("show");
    $("moveStudentSub").textContent = state.row.student_name + " • abhi: " + state.row.class_name + " / " + state.row.batch_name;
    (S().fillClassSelect || function () {})($("moveClassSelect"), true);
    (S().fillBatchSelect || function () {})($("moveBatchSelect"), null, true);
    $("moveFeeInput").value = "";
    $("moveStudentOverlay").classList.add("open");
  }

  async function saveMove(e) {
    e.preventDefault();
    if (state.busy || !state.row) return;
    const errBox = $("moveStudentError");
    errBox.textContent = "";
    errBox.classList.remove("show");

    const newBatchId = $("moveBatchSelect").value;
    if (!newBatchId) {
      errBox.textContent = "Naya class aur batch chuno";
      errBox.classList.add("show");
      return;
    }
    if (newBatchId === state.row.batch_id) {
      errBox.textContent = "Ye student pehle se isi batch me hai";
      errBox.classList.add("show");
      return;
    }

    const feeRaw = $("moveFeeInput").value.trim();
    let newFee = null;
    if (feeRaw) {
      newFee = Number(feeRaw);
      if (!Number.isFinite(newFee) || newFee < 0) {
        errBox.textContent = "Fee 0 ya usse upar honi chahiye";
        errBox.classList.add("show");
        return;
      }
    }

    const go = window.confirm(state.row.student_name + " ko naye batch me move karna hai?\nPurani enrollment band ho jayegi, nayi banegi.");
    if (!go) return;

    const btn = $("saveMoveStudentBtn");
    setBusy(btn, true, "Moving...", "Save");
    state.busy = true;
    try {
      const res = await sb.rpc("move_student", {
        p_enrollment_id: state.row.enrollment_id,
        p_new_batch_id: newBatchId,
        p_new_fee_total: newFee,
      });
      if (res.error) throw res.error;
      const out = res.data || {};
      if (out.old_remaining && Number(out.old_remaining) > 0) {
        showToast("Move ho gaya. Purani pending fee (" + money(out.old_remaining) + ") 'Left with dues' me dikhigi.", "warn");
      } else {
        showToast("Student move ho gaya", "success");
      }
      $("moveStudentOverlay").classList.remove("open");
      closeProfile();
      if (S().loadAll) await S().loadAll();
    } catch (err) {
      errBox.textContent = plainError(err);
      errBox.classList.add("show");
    } finally {
      state.busy = false;
      setBusy(btn, false, "", "Save");
    }
  }

  // ---------- Remove from batch ----------
  async function removeFromBatch() {
    if (!state.row || state.busy) return;
    const go = window.confirm(
      state.row.student_name + " ko is batch se remove karna hai?\n" +
      (Number(state.row.remaining) > 0
        ? "DHyan do: " + money(state.row.remaining) + " pending hai — ye 'Left with dues' me chala jayega.\n"
        : "") +
      "History safe rahegi. Dobara add kar sakte ho."
    );
    if (!go) return;
    const btn = $("pfRemoveBtn");
    setBusy(btn, true, "Removing...", "Remove from batch");
    state.busy = true;
    try {
      const res = await sb.rpc("end_enrollment", { p_enrollment_id: state.row.enrollment_id });
      if (res.error) throw res.error;
      showToast("Student batch se remove ho gaya", "success");
      closeProfile();
      if (S().loadAll) await S().loadAll();
    } catch (err) {
      showToast(plainError(err), "error");
    } finally {
      state.busy = false;
      setBusy(btn, false, "", "Remove from batch");
    }
  }

  // ---------- refresh helpers ----------
  async function refreshCurrent() {
    if (!state.row) return;
    try {
      const res = await sb.from("v_students_overview").select("*").eq("enrollment_id", state.row.enrollment_id).single();
      if (res.error) throw res.error;
      if (res.data) {
        state.row = res.data;
        await openProfileRefresh();
      }
    } catch (err) {
      showToast(plainError(err), "error");
    }
  }

  // openProfile without re-opening the overlay (already open)
  async function openProfileRefresh() {
    const row = state.row;
    const attEl = $("pfAttPercent");
    if (row.attendance_percent === null || row.attendance_percent === undefined) {
      attEl.textContent = "—";
      attEl.className = "stat-box-val";
    } else {
      const p = Number(row.attendance_percent);
      attEl.textContent = p.toFixed(0) + "%";
      attEl.className = "stat-box-val " + (p >= 75 ? "ok" : (p >= 50 ? "warn" : "bad"));
    }
    const feeEl = $("pfFeeStatus");
    if (row.fee_status === "paid") { feeEl.textContent = "Paid"; feeEl.className = "stat-box-val ok"; }
    else if (row.fee_status === "partial") { feeEl.textContent = "Partial"; feeEl.className = "stat-box-val warn"; }
    else if (row.fee_status === "pending") { feeEl.textContent = "Pending"; feeEl.className = "stat-box-val bad"; }
    else { feeEl.textContent = "Not set"; feeEl.className = "stat-box-val"; }
    feeEl.parentElement.querySelector(".stat-box-label").textContent =
      "Fee Status" + (row.remaining > 0 ? " (" + money(row.remaining) + " remaining)" : "");
    $("pfDays").textContent = (row.present_days ?? "—") + " / " + (row.total_days ?? "—");
    $("pfFeeTotal").textContent = row.fee_status === "not_set" ? "Not set" : money(row.fee_total);
    $("pfPaid").textContent = money(row.paid);
    $("pfRemaining").textContent = money(row.remaining);
    const res = await sb.from("payments")
      .select("id, amount, paid_on, mode, txn_ref, receipt_no, status, cancelled_reason")
      .eq("enrollment_id", row.enrollment_id)
      .order("paid_on", { ascending: false });
    if (res.error) throw res.error;
    state.payments = res.data || [];
    renderPayments();
  }

  function closeProfile() {
    $("profileModalOverlay").classList.remove("open");
    state.row = null;
    state.payments = [];
  }

  function onStudentEdited() {
    if (state.row) refreshCurrent();
  }

  // ---------- events ----------
  $("closeProfileBtn").addEventListener("click", closeProfile);
  $("closeProfileFooterBtn").addEventListener("click", closeProfile);
  $("profileModalOverlay").addEventListener("click", (e) => {
    if (e.target === $("profileModalOverlay")) closeProfile();
  });

  $("pfEditBtn").addEventListener("click", () => { if (state.row) (S().openEditModal || function(){})(state.row); });
  $("pfMoveBtn").addEventListener("click", openMoveModal);
  $("pfRemoveBtn").addEventListener("click", removeFromBatch);
  $("editFeeBtn").addEventListener("click", openFeeEdit);

  $("closeMoveStudentBtn").addEventListener("click", () => $("moveStudentOverlay").classList.remove("open"));
  $("cancelMoveStudentBtn").addEventListener("click", () => $("moveStudentOverlay").classList.remove("open"));
  $("moveStudentForm").addEventListener("submit", saveMove);
  const mcs = $("moveClassSelect");
  if (mcs) mcs.addEventListener("change", () => (S().fillBatchSelect || function(){})($("moveBatchSelect"), mcs.value, true));

  $("closeFeeEditBtn").addEventListener("click", () => $("feeEditOverlay").classList.remove("open"));
  $("cancelFeeEditBtn").addEventListener("click", () => $("feeEditOverlay").classList.remove("open"));
  $("feeEditForm").addEventListener("submit", saveFeeEdit);

  $("closeCancelPayBtn").addEventListener("click", () => $("cancelPayOverlay").classList.remove("open"));
  $("cancelCancelPayBtn").addEventListener("click", () => $("cancelPayOverlay").classList.remove("open"));
  $("cancelPayForm").addEventListener("submit", saveCancelPay);

  window.EDU_PROFILE = { openProfile, onStudentEdited, refreshCurrent };
})();
