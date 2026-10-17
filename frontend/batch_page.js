// EduFlow OS — batch_page.js (Step 3 fb: batch detail page)
// Opens from Classes &amp; Batches "Open" button. Same compact rows and the same
// profile modal as All Students page (reused via EDU_PROFILE / EDU_STUDENTS).

(function () {
  "use strict";

  if (typeof sb === "undefined" || !sb) return;

  const $ = (id) => document.getElementById(id);

  const state = { batchId: null, className: "", rows: [], loading: false };

  function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function toast(msg, type) {
    if (window.EDU && window.EDU.showToast) window.EDU.showToast(msg, type);
  }

  function plainError(err) {
    if (window.EDU && window.EDU.plainError) return window.EDU.plainError(err);
    return (err && err.message) || "Kuch galat ho gaya. Dobara try karo.";
  }

  function node(tag, cls) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    return n;
  }

  // ---------- open / close ----------
  function showPageOnly(pageId) {
    document.querySelectorAll(".page").forEach(function (p) { p.classList.remove("active"); });
    const page = $(pageId);
    if (page) page.classList.add("active");
  }

  function openBatch(batchId, className) {
    state.batchId = batchId;
    state.className = className || "";
    showPageOnly("page-batch");
    document.querySelectorAll(".nav-item[data-page]").forEach(function (n) { n.classList.remove("active"); });
    const navClasses = $("navClasses");
    if (navClasses) navClasses.classList.add("active");
    loadAndRender();
  }

  function goBack() {
    showPageOnly("page-classes");
    document.querySelectorAll(".nav-item[data-page]").forEach(function (n) { n.classList.remove("active"); });
    const navClasses = $("navClasses");
    if (navClasses) navClasses.classList.add("active");
  }

  // ---------- data ----------
  async function loadAndRender() {
    if (!state.batchId || state.loading) return;
    state.loading = true;

    const host = $("bpStudentRows");
    clearNode(host);
    const loadBox = node("div", "empty-state");
    loadBox.textContent = "Loading students...";
    host.appendChild(loadBox);

    try {
      const res = await sb.from("v_students_overview").select("*").eq("batch_id", state.batchId);
      if (res.error) throw res.error;
      state.rows = res.data || [];
      renderHead();
      renderSummary();
      renderRows();
    } catch (err) {
      clearNode(host);
      const e = node("div", "empty-state");
      e.textContent = "Load fail: " + plainError(err);
      host.appendChild(e);
    } finally {
      state.loading = false;
    }
  }

  function renderHead() {
    const bName = state.rows.length > 0 ? state.rows[0].batch_name : "Batch";
    $("bpTitle").textContent = state.className ? (state.className + " — " + bName) : bName;
    $("bpSub").textContent = "Batch students";
  }

  function renderSummary() {
    let pending = 0;
    let attSum = 0;
    let attCount = 0;
    state.rows.forEach(function (r) {
      const rem = Number(r.remaining || 0);
      if (r.fee_status !== "not_set" && rem > 0) pending += rem;
      if (r.attendance_percent !== null && r.attendance_percent !== undefined) {
        attSum += Number(r.attendance_percent);
        attCount += 1;
      }
    });
    $("bpStudentCount").textContent = String(state.rows.length);
    const money = window.EDU ? window.EDU.money(pending) : ("₹" + pending);
    $("bpPendingFees").textContent = money;
    $("bpAvgAttendance").textContent = attCount > 0 ? (Math.round(attSum / attCount) + "%") : "—";
  }

  function renderRows() {
    const host = $("bpStudentRows");
    clearNode(host);

    if (state.rows.length === 0) {
      const e = node("div", "empty-state");
      e.textContent = "Is batch me abhi koi active student nahi. Add student dabao.";
      host.appendChild(e);
      return;
    }

    state.rows.forEach(function (row) { host.appendChild(buildRow(row)); });
  }

  function buildRow(row) {
    const r = node("div", "student-row");

    const av = node("div", "s-avatar");
    av.textContent = initialsOf(row.student_name);
    r.appendChild(av);

    const nb = node("div", "s-name-block");
    const nm = node("div", "s-name");
    nm.textContent = row.student_name;
    const cd = node("div", "s-code");
    cd.textContent = row.student_code;
    nb.appendChild(nm);
    nb.appendChild(cd);
    r.appendChild(nb);

    const att = node("div", "s-att");
    const top = node("div", "s-att-top");
    const lbl = node("span");
    lbl.textContent = "Attendance";
    const pct = node("span");
    const bar = node("div", "att-bar");
    const fill = node("div", "att-fill");
    if (row.attendance_percent === null || row.attendance_percent === undefined) {
      pct.textContent = "No data";
      fill.className += " none";
      fill.style.width = "0%";
    } else {
      const p = Number(row.attendance_percent);
      pct.textContent = p.toFixed(0) + "%";
      fill.style.width = Math.max(0, Math.min(100, p)) + "%";
      if (p < 75) fill.className += " low";
    }
    top.appendChild(lbl);
    top.appendChild(pct);
    bar.appendChild(fill);
    att.appendChild(top);
    att.appendChild(bar);
    r.appendChild(att);

    feeBadge(row.fee_status, r);

    const acts = node("div", "s-actions");
    const viewBtn = node("button", "btn btn-secondary btn-sm");
    viewBtn.type = "button";
    viewBtn.textContent = "View";
    viewBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      openProfile(row);
    });
    acts.appendChild(viewBtn);
    r.appendChild(acts);

    r.addEventListener("click", function () { openProfile(row); });

    return r;
  }

  function feeBadge(feeStatus, host) {
    const b = node("span");
    if (feeStatus === "paid") { b.className = "badge badge-success"; b.textContent = "Paid"; }
    else if (feeStatus === "partial") { b.className = "badge badge-info"; b.textContent = "Partial"; }
    else if (feeStatus === "pending") { b.className = "badge badge-warn"; b.textContent = "Pending"; }
    else { b.className = "badge badge-muted"; b.textContent = "Fee not set"; }
    host.appendChild(b);
  }

  function initialsOf(name) {
    const parts = String(name || "?").trim().split(/\s+/);
    const a = (parts[0] || "?").charAt(0).toUpperCase();
    const b = parts.length > 1 ? (parts[parts.length - 1] || "").charAt(0).toUpperCase() : "";
    return (a + b) || "?";
  }

  function openProfile(row) {
    if (window.EDU_PROFILE && window.EDU_PROFILE.openProfile) window.EDU_PROFILE.openProfile(row);
  }

  // ---------- events ----------
  function bind() {
    const back = $("bpBackBtn");
    if (back) back.addEventListener("click", goBack);

    const addStu = $("bpAddStudentBtn");
    if (addStu) addStu.addEventListener("click", function () {
      if (window.EDU_STUDENTS && window.EDU_STUDENTS.openAddModalForBatch) {
        window.EDU_STUDENTS.openAddModalForBatch(state.batchId);
      } else if (window.EDU_STUDENTS && window.EDU_STUDENTS.openAddModal) {
        window.EDU_STUDENTS.openAddModal();
      } else {
        toast("Students module load nahi hua — refresh karo", "error");
      }
    });

    const takeAtt = $("bpTakeAttBtn");
    if (takeAtt) takeAtt.addEventListener("click", function () {
      toast("Attendance Step 4 me aayega 🚧", "warn");
    });
  }

  bind();

  window.EDU_BATCH = { openBatch: openBatch, loadAndRender: loadAndRender };
})();
