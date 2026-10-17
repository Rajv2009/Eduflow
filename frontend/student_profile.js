// EduFlow OS — student_profile.js (Step 3 fb: Student Profile modal)
// Rules: client = sb, textContent only, no delete. Money via EDU.money
// (₹30,000 no decimals), phones via EDU.phone (+91 98123 45606).
// Payments: read from payments table; Cancel = rpc('cancel_payment');
// Edit = EDU_PAYMENTS (rpc('edit_payment'), old entry stays "Corrected");
// Add = EDU_PAYMENTS (rpc('add_payment') + fresh idempotency key).
// Cancelled/corrected entries greyed out with reason; note under each payment.
// Fee edit = enrollments update (DB blocks below-paid; Hinglish error).
// Move = rpc('move_student'); Remove from batch = rpc('end_enrollment').

(function () {
  "use strict";
  if (typeof sb === "undefined" || !sb) return;

  const $ = (id) => document.getElementById(id);
  const E = () => window.EDU || {};
  const S = () => window.EDU_STUDENTS || {};
  const state = { row: null, payments: [], busy: false, cancelPayId: null };

  function money(v) { return E().money ? E().money(v) : "₹" + Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 }); }
  function phone(v) { return E().phone ? E().phone(v) : (v || "—"); }
  function fmtDate(d) { return S().fmtDate ? S().fmtDate(d) : (d || "—"); }
  function plainError(err) { return E().plainError ? E().plainError(err) : ((err && err.message) || "Kuch galat ho gaya. Dobara try karo."); }
  function showToast(m, t) { if (E().showToast) E().showToast(m, t); }
  function setBusy(btn, busy, busyText, normalText) { if (!btn) return; btn.disabled = !!busy; btn.textContent = busy ? busyText : normalText; }
  function clearNode(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function mk(tag, cls) { const n = document.createElement(tag); if (cls) n.className = cls; return n; }

  function feeErrHinglish(err) {
    const m = String((err && err.message) || "");
    if (m.includes("cannot go below")) return "Nayi fee paid amount se kam nahi ho sakti. Total paid amount se upar ya barabar rakho.";
    return plainError(err);
  }

  function fillStatic(row) {
    $("profileTitle").textContent = row.student_name;
    $("profileSub").textContent = row.student_code + " • " + row.class_name + " • " + row.batch_name;

    const attEl = $("pfAttPercent");
    if (row.attendance_percent === null || row.attendance_percent === undefined) {
      attEl.textContent = "—"; attEl.className = "stat-box-val";
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
    const rem = Number(row.remaining || 0);
    $("pfFeeStatusLabel").textContent = rem > 0 ? ("Fee Status (" + money(rem) + " remaining)") : "Fee Status";

    $("pfDays").textContent = (row.present_days ?? "—") + " / " + (row.total_days ?? "—");
    $("pfClass").textContent = row.class_name || "—";
    $("pfBatch").textContent = row.batch_name || "—";
    $("pfJoined").textContent = fmtDate(row.enrollment_date);
    $("pfFeeTotal").textContent = row.fee_status === "not_set" ? "Not set" : money(row.fee_total);
    $("pfPaid").textContent = money(row.paid);
    $("pfRemaining").textContent = money(row.remaining);

    $("pfParentName").textContent = row.parent_name || "—";
    $("pfParentPhone").textContent = row.parent_phone ? phone(row.parent_phone) : "—";
    const opt = $("pfOptIn");
    opt.textContent = row.parent_phone ? (row.parent_opt_in ? "Yes" : "No") : "—";
    opt.style.color = row.parent_opt_in ? "var(--success)" : "";
  }

  async function openProfile(row) {
    state.row = row;
    fillStatic(row);
    $("profileModalOverlay").classList.add("open");
    await loadPayments(row.enrollment_id);
  }

  async function loadPayments(enrollmentId) {
    const host = $("pfPayList");
    clearNode(host);
    const box = mk("div", "empty-state");
    box.style.padding = "12px";
    box.textContent = "Payments load ho rahe hain...";
    host.appendChild(box);
    try {
      const res = await sb.from("payments")
        .select("id, amount, paid_on, mode, txn_ref, receipt_no, status, cancelled_reason, note")
        .eq("enrollment_id", enrollmentId)
        .order("paid_on", { ascending: false });
      if (res.error) throw res.error;
      state.payments = res.data || [];
      renderPayments();
    } catch (err) {
      clearNode(host);
      const e = mk("div", "empty-state");
      e.style.padding = "12px";
      e.textContent = "Payments load fail: " + plainError(err);
      host.appendChild(e);
    }
  }

  function renderPayments() {
    const host = $("pfPayList");
    clearNode(host);
    if (!state.payments.length) {
      const e = mk("div", "empty-state");
      e.style.padding = "12px";
      e.textContent = "Abhi tak koi payment nahi hui.";
      host.appendChild(e);
      return;
    }
    state.payments.forEach(function (p) {
      const isActive = p.status === "active";
      const item = mk("div", "pay-item" + (isActive ? "" : " " + p.status));
      const top = mk("div", "pay-top");

      const amt = mk("span", "pay-amt");
      amt.textContent = money(p.amount);

      const meta = mk("span", "pay-meta");
      let m = fmtDate(p.paid_on) + " • " + (p.mode || "cash").toUpperCase() + " • " + (p.receipt_no || "—");
      if (p.txn_ref) m += " • " + p.txn_ref;
      meta.textContent = m;

      const badge = mk("span", "badge");
      if (isActive) { badge.className += " badge-success"; badge.textContent = "Active"; }
      else if (p.status === "cancelled") { badge.className += " badge-muted"; badge.textContent = "Cancelled"; }
      else { badge.className += " badge-warn"; badge.textContent = "Corrected"; }

      top.appendChild(amt); top.appendChild(meta); top.appendChild(badge);

      if (!isActive) {
        const r = mk("div", "pay-note");
        r.textContent = "Reason: " + (p.cancelled_reason || p.note || "—");
        top.appendChild(r);
      }
      if (p.note) {
        const n = mk("div", "pay-note");
        n.textContent = "Note: " + p.note;
        top.appendChild(n);
      }

      if (isActive) {
        const actions = mk("div", "pay-actions");
        const editBtn = mk("button", "btn btn-secondary btn-sm");
        editBtn.type = "button"; editBtn.textContent = "Edit";
        editBtn.addEventListener("click", function () {
          if (window.EDU_PAYMENTS && window.EDU_PAYMENTS.openEditPay) window.EDU_PAYMENTS.openEditPay(p);
        });
        const cancelBtn = mk("button", "btn btn-secondary btn-sm");
        cancelBtn.type = "button"; cancelBtn.textContent = "Cancel";
        cancelBtn.addEventListener("click", function () { openCancelPay(p); });
        actions.appendChild(editBtn); actions.appendChild(cancelBtn);
        top.appendChild(actions);
      }

      item.appendChild(top);
      host.appendChild(item);
    });
  }

  function openCancelPay(p) {
    state.cancelPayId = p.id;
    $("cancelPaySub").textContent = money(p.amount) + " • Receipt " + (p.receipt_no || "—");
    $("cancelPayReasonInput").value = "";
    const err = $("cancelPayError");
    err.textContent = ""; err.classList.remove("show");
    $("cancelPayOverlay").classList.add("open");
    $("cancelPayReasonInput").focus();
  }

  async function saveCancelPay(e) {
    e.preventDefault();
    if (state.busy) return;
    const reason = $("cancelPayReasonInput").value.trim();
    const errBox = $("cancelPayError");
    errBox.textContent = ""; errBox.classList.remove("show");
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

  function openFeeEdit() {
    if (!state.row) return;
    $("feeEditInput").value = Number(state.row.fee_total || 0);
    $("feeEditHint").textContent = "Abhi tak paid: " + money(state.row.paid) + ". Nayi fee isse kam nahi ho sakti.";
    const err = $("feeEditError");
    err.textContent = ""; err.classList.remove("show");
    $("feeEditOverlay").classList.add("open");
    $("feeEditInput").focus();
  }

  async function saveFeeEdit(e) {
    e.preventDefault();
    if (state.busy || !state.row) return;
    const errBox = $("feeEditError");
    errBox.textContent = ""; errBox.classList.remove("show");
    const fee = Number($("feeEditInput").value);
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

  function openMoveModal() {
    if (!state.row) return;
    const err = $("moveStudentError");
    err.textContent = ""; err.classList.remove("show");
    $("moveStudentSub").textContent = state.row.student_name + " • abhi: " + state.row.class_name + " / " + state.row.batch_name;
    if (S().fillClassSelect) S().fillClassSelect($("moveClassSelect"), true);
    if (S().fillBatchSelect) S().fillBatchSelect($("moveBatchSelect"), null, true);
    $("moveFeeInput").value = "";
    $("moveStudentOverlay").classList.add("open");
  }

  async function saveMove(e) {
    e.preventDefault();
    if (state.busy || !state.row) return;
    const errBox = $("moveStudentError");
    errBox.textContent = ""; errBox.classList.remove("show");

    const newBatchId = $("moveBatchSelect").value;
    if (!newBatchId) { errBox.textContent = "Naya class aur batch chuno"; errBox.classList.add("show"); return; }
    if (newBatchId === state.row.batch_id) { errBox.textContent = "Ye student pehle se isi batch me hai"; errBox.classList.add("show"); return; }

    const feeRaw = $("moveFeeInput").value.trim();
    let newFee = null;
    if (feeRaw) {
      newFee = Number(feeRaw);
      if (!Number.isFinite(newFee) || newFee < 0) { errBox.textContent = "Fee 0 ya usse upar honi chahiye"; errBox.classList.add("show"); return; }
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
      if (window.EDU_BATCH && window.EDU_BATCH.loadAndRender) await window.EDU_BATCH.loadAndRender();
    } catch (err) {
      errBox.textContent = plainError(err);
      errBox.classList.add("show");
    } finally {
      state.busy = false;
      setBusy(btn, false, "", "Save");
    }
  }

  async function removeFromBatch() {
    if (!state.row || state.busy) return;
    const rem = Number(state.row.remaining || 0);
    const go = window.confirm(
      state.row.student_name + " ko is batch se remove karna hai?\n" +
      (rem > 0 ? "Dhyaan do: " + money(rem) + " pending hai — ye 'Left with dues' me chala jayega.\n" : "") +
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
      if (window.EDU_BATCH && window.EDU_BATCH.loadAndRender) await window.EDU_BATCH.loadAndRender();
    } catch (err) {
      showToast(plainError(err), "error");
    } finally {
      state.busy = false;
      setBusy(btn, false, "", "Remove from batch");
    }
  }

  async function refreshCurrent() {
    if (!state.row) return;
    try {
      const res = await sb.from("v_students_overview").select("*").eq("enrollment_id", state.row.enrollment_id).single();
      if (res.error) throw res.error;
      if (res.data) { state.row = res.data; fillStatic(state.row); }
      await loadPayments(state.row.enrollment_id);
    } catch (err) {
      showToast(plainError(err), "error");
    }
  }

  function onStudentEdited() { if (state.row) refreshCurrent(); }

  function closeProfile() {
    $("profileModalOverlay").classList.remove("open");
    state.row = null;
    state.payments = [];
  }

  $("closeProfileBtn").addEventListener("click", closeProfile);
  $("closeProfileFooterBtn").addEventListener("click", closeProfile);
  $("profileModalOverlay").addEventListener("click", function (e) { if (e.target === $("profileModalOverlay")) closeProfile(); });

  $("pfAddPayBtn").addEventListener("click", function () {
    if (state.row && window.EDU_PAYMENTS && window.EDU_PAYMENTS.openAddPay) window.EDU_PAYMENTS.openAddPay(state.row);
  });
  $("pfEditBtn").addEventListener("click", function () {
    if (state.row && S().openEditModal) S().openEditModal(state.row);
  });
  $("pfMoveBtn").addEventListener("click", openMoveModal);
  $("pfRemoveBtn").addEventListener("click", removeFromBatch);
  $("editFeeBtn").addEventListener("click", openFeeEdit);

  $("closeMoveStudentBtn").addEventListener("click", function () { $("moveStudentOverlay").classList.remove("open"); });
  $("cancelMoveStudentBtn").addEventListener("click", function () { $("moveStudentOverlay").classList.remove("open"); });
  $("moveStudentForm").addEventListener("submit", saveMove);
  const mcs = $("moveClassSelect");
  if (mcs) mcs.addEventListener("change", function () {
    if (S().fillBatchSelect) S().fillBatchSelect($("moveBatchSelect"), mcs.value, true);
  });

  $("closeFeeEditBtn").addEventListener("click", function () { $("feeEditOverlay").classList.remove("open"); });
  $("cancelFeeEditBtn").addEventListener("click", function () { $("feeEditOverlay").classList.remove("open"); });
  $("feeEditForm").addEventListener("submit", saveFeeEdit);

  $("closeCancelPayBtn").addEventListener("click", function () { $("cancelPayOverlay").classList.remove("open"); });
  $("cancelCancelPayBtn").addEventListener("click", function () { $("cancelPayOverlay").classList.remove("open"); });
  $("cancelPayForm").addEventListener("submit", saveCancelPay);

  window.EDU_PROFILE = { openProfile: openProfile, onStudentEdited: onStudentEdited, refreshCurrent: refreshCurrent };
})();
