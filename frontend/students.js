// EduFlow OS — students.js (Step 3: Students page)
// Rules: client = sb, textContent only, no delete, errors in plain Hinglish.
// Reads: v_students_overview (+ students row for school/notes in edit).
// Writes: create_student_with_enrollment RPC, plain students updates.
// Phone is always saved as 91+10 digits (10-digit input is auto-prefixed).

(function () {
  "use strict";

  if (typeof sb === "undefined" || !sb) return;

  const $ = (id) => document.getElementById(id);

  const state = {
    rows: [],
    archived: [],
    classes: [],
    batches: [],
    showArchived: false,
    addBusy: false,
    editBusy: false,
    editStudentId: null,
    loading: false,
  };

  // ---------- helpers ----------
  function showToast(msg, type) {
    const host = $("toastContainer");
    if (!host) return;
    const t = document.createElement("div");
    t.className = "toast " + (type || "");
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  function plainError(err) {
    const m = (err && (err.message || err.error_description)) || "Kuch galat ho gaya. Dobara try karo.";
    return m;
  }

  function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function setButtonBusy(btn, busy, busyText, normalText) {
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? busyText : normalText;
  }

  function money(v) {
    const n = Number(v || 0);
    return "₹" + n.toFixed(2);
  }

  // Phone: 10 digit -> 91+10; 91+10 stays; empty -> null; else invalid
  function normalizePhone(raw) {
    if (raw === null || raw === undefined) return null;
    const digits = String(raw).replace(/\D/g, "");
    if (digits.length === 0) return null;
    if (digits.length === 10 && /^[6-9]/.test(digits)) return "91" + digits;
    if (digits.length === 12 && digits.startsWith("91")) return digits;
    return "";
  }

  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/);
    const a = (parts[0] || "?").charAt(0).toUpperCase();
    const b = parts.length > 1 ? (parts[parts.length - 1] || "").charAt(0).toUpperCase() : "";
    return (a + b) || "?";
  }

  function fmtDate(d) {
    if (!d) return "—";
    try {
      const dt = new Date(d + (String(d).length === 10 ? "T00:00:00+05:30" : ""));
      if (isNaN(dt.getTime())) return String(d);
      return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    } catch {
      return String(d);
    }
  }

  function feeBadge(feeStatus, host) {
    const b = document.createElement("span");
    if (feeStatus === "paid") { b.className = "badge badge-success"; b.textContent = "Paid"; }
    else if (feeStatus === "partial") { b.className = "badge badge-info"; b.textContent = "Partial"; }
    else if (feeStatus === "pending") { b.className = "badge badge-warn"; b.textContent = "Pending"; }
    else { b.className = "badge badge-muted"; b.textContent = "Fee not set"; }
    host.appendChild(b);
  }

  // ---------- data ----------
  async function loadAll() {
    if (state.loading) return;
    state.loading = true;
    const host = $("studentsList");
    if (host) {
      clearNode(host);
      const s = document.createElement("div");
      s.className = "empty-state";
      s.textContent = "Loading students...";
      host.appendChild(s);
    }
    try {
      const [rowsRes, archRes, clsRes, batRes] = await Promise.all([
        sb.from("v_students_overview").select("*").order("class_created_at", { ascending: true }),
        sb.from("students").select("id, student_code, full_name, parent_name, archived_at")
          .not("archived_at", "is", null).order("created_at", { ascending: true }),
        sb.from("classes").select("id, name, archived_at, created_at").order("created_at", { ascending: true }),
        sb.from("batches").select("id, class_id, name, default_fee, archived_at, created_at").order("created_at", { ascending: true }),
      ]);
      if (rowsRes.error) throw rowsRes.error;
      if (archRes.error) throw archRes.error;
      if (clsRes.error) throw clsRes.error;
      if (batRes.error) throw batRes.error;
      state.rows = rowsRes.data || [];
      state.archived = archRes.data || [];
      state.classes = clsRes.data || [];
      state.batches = batRes.data || [];
      render();
    } catch (err) {
      if (host) {
        clearNode(host);
        const e = document.createElement("div");
        e.className = "empty-state";
        e.textContent = "Load fail: " + plainError(err);
        host.appendChild(e);
      }
    } finally {
      state.loading = false;
    }
  }

  // ---------- render ----------
  function buildRow(row) {
    const r = document.createElement("div");
    r.className = "student-row";

    const av = document.createElement("div");
    av.className = "s-avatar";
    av.textContent = initials(row.student_name);
    r.appendChild(av);

    const nb = document.createElement("div");
    nb.className = "s-name-block";
    const nm = document.createElement("div");
    nm.className = "s-name";
    nm.textContent = row.student_name;
    const cd = document.createElement("div");
    cd.className = "s-code";
    cd.textContent = row.student_code + " • " + row.batch_name;
    nb.appendChild(nm);
    nb.appendChild(cd);
    r.appendChild(nb);

    const att = document.createElement("div");
    att.className = "s-att";
    const top = document.createElement("div");
    top.className = "s-att-top";
    const lbl = document.createElement("span");
    lbl.textContent = "Attendance";
    const pct = document.createElement("span");
    const bar = document.createElement("div");
    bar.className = "att-bar";
    const fill = document.createElement("div");
    fill.className = "att-fill";
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

    const acts = document.createElement("div");
    acts.className = "s-actions";

    const viewBtn = document.createElement("button");
    viewBtn.className = "btn btn-secondary btn-sm";
    viewBtn.type = "button";
    viewBtn.textContent = "View";
    viewBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (window.EDU_PROFILE && window.EDU_PROFILE.openProfile) window.EDU_PROFILE.openProfile(row);
    });

    const menuBtn = document.createElement("button");
    menuBtn.className = "btn btn-secondary btn-sm";
    menuBtn.type = "button";
    menuBtn.textContent = "⋯";
    menuBtn.setAttribute("aria-label", "More actions");
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleRowMenu(r, row);
    });

    acts.appendChild(viewBtn);
    acts.appendChild(menuBtn);
    r.appendChild(acts);

    r.addEventListener("click", () => {
      if (window.EDU_PROFILE && window.EDU_PROFILE.openProfile) window.EDU_PROFILE.openProfile(row);
    });

    return r;
  }

  function toggleRowMenu(rowEl, row) {
    document.querySelectorAll(".s-menu.open").forEach((m) => m.remove());
    const menu = document.createElement("div");
    menu.className = "s-menu open";

    const viewItem = document.createElement("div");
    viewItem.className = "s-menu-item";
    viewItem.textContent = "View profile";
    viewItem.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.remove();
      if (window.EDU_PROFILE && window.EDU_PROFILE.openProfile) window.EDU_PROFILE.openProfile(row);
    });

    const editItem = document.createElement("div");
    editItem.className = "s-menu-item";
    editItem.textContent = "Edit details";
    editItem.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.remove();
      openEditModal(row);
    });

    const archItem = document.createElement("div");
    archItem.className = "s-menu-item danger";
    archItem.textContent = "Archive student";
    archItem.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.remove();
      archiveStudent(row);
    });

    menu.appendChild(viewItem);
    menu.appendChild(editItem);
    menu.appendChild(archItem);
    rowEl.appendChild(menu);

    setTimeout(() => {
      document.addEventListener("click", function closer() {
        menu.remove();
        document.removeEventListener("click", closer);
      });
    }, 0);
  }

  function render() {
    const host = $("studentsList");
    if (!host) return;
    clearNode(host);

    if (state.rows.length === 0) {
      const e = document.createElement("div");
      e.className = "empty-state";
      e.textContent = "Koi active student nahi. Add Student dabao.";
      host.appendChild(e);
    }

    const classMap = new Map();
    state.rows.forEach((row) => {
      if (!classMap.has(row.class_id)) {
        classMap.set(row.class_id, {
          class: { id: row.class_id, name: row.class_name, created: row.class_created_at },
          batches: new Map(),
        });
      }
      const c = classMap.get(row.class_id);
      if (!c.batches.has(row.batch_id)) {
        c.batches.set(row.batch_id, { name: row.batch_name, created: row.batch_created_at, rows: [] });
      }
      c.batches.get(row.batch_id).rows.push(row);
    });

    const classOrder = Array.from(classMap.values()).sort((a, b) => {
      const ta = new Date(a.class.created || 0).getTime();
      const tb = new Date(b.class.created || 0).getTime();
      return ta - tb;
    });

    classOrder.forEach((c) => {
      const section = document.createElement("div");
      section.className = "class-section";

      const head = document.createElement("div");
      head.className = "class-head";
      const chev = document.createElement("span");
      chev.className = "chev";
      chev.textContent = "▼";
      const cName = document.createElement("span");
      cName.className = "class-name";
      cName.textContent = c.class.name;
      let total = 0;
      c.batches.forEach((b) => { total += b.rows.length; });
      const cCount = document.createElement("span");
      cCount.className = "class-count";
      cCount.textContent = total + " students";
      head.appendChild(chev);
      head.appendChild(cName);
      head.appendChild(cCount);
      head.addEventListener("click", () => section.classList.toggle("collapsed"));

      const body = document.createElement("div");
      body.className = "class-body";

      const batchOrder = Array.from(c.batches.values()).sort((a, b) => {
        const ta = new Date(a.created || 0).getTime();
        const tb = new Date(b.created || 0).getTime();
        return ta - tb;
      });

      batchOrder.forEach((b) => {
        const group = document.createElement("div");
        group.className = "batch-group";
        const bh = document.createElement("div");
        bh.className = "batch-head";
        const bn = document.createElement("span");
        bn.className = "batch-name";
        bn.textContent = b.name;
        const bc = document.createElement("span");
        bc.className = "batch-count";
        bc.textContent = b.rows.length + " students";
        bh.appendChild(bn);
        bh.appendChild(bc);
        group.appendChild(bh);

        const rowsWrap = document.createElement("div");
        rowsWrap.className = "student-rows";
        b.rows.forEach((row) => rowsWrap.appendChild(buildRow(row)));
        group.appendChild(rowsWrap);
        body.appendChild(group);
      });

      section.appendChild(head);
      section.appendChild(body);
      host.appendChild(section);
    });

    if (state.showArchived && state.archived.length > 0) {
      const archCard = document.createElement("div");
      archCard.className = "card";
      archCard.style.marginTop = "14px";
      const ah = document.createElement("div");
      ah.className = "card-header";
      const at = document.createElement("div");
      at.className = "card-title";
      at.textContent = "Archived Students (" + state.archived.length + ")";
      ah.appendChild(at);
      archCard.appendChild(ah);
      const ab = document.createElement("div");
      ab.className = "card-body";
      const list = document.createElement("div");
      list.className = "archived-list";
      state.archived.forEach((s) => {
        const card = document.createElement("div");
        card.className = "arch-card";
        const nm = document.createElement("div");
        nm.className = "a-name";
        nm.textContent = s.full_name;
        const mt = document.createElement("div");
        mt.className = "a-meta";
        mt.textContent = s.student_code;
        const btn = document.createElement("button");
        btn.className = "btn btn-secondary btn-sm";
        btn.type = "button";
        btn.textContent = "Restore";
        btn.addEventListener("click", async () => {
          btn.disabled = true;
          try {
            const res = await sb.from("students").update({ archived_at: null }).eq("id", s.id);
            if (res.error) throw res.error;
            showToast("Student restore ho gaya", "success");
            await loadAll();
          } catch (err) {
            showToast(plainError(err), "error");
            btn.disabled = false;
          }
        });
        card.appendChild(nm);
        card.appendChild(mt);
        card.appendChild(btn);
        list.appendChild(card);
      });
      ab.appendChild(list);
      archCard.appendChild(ab);
      host.appendChild(archCard);
    }
  }

  // ---------- Add Student ----------
  function activeClasses() { return state.classes.filter((c) => !c.archived_at); }
  function activeBatches() { return state.batches.filter((b) => !b.archived_at); }

  function fillClassSelect(sel, withPlaceholder) {
    clearNode(sel);
    if (withPlaceholder) {
      const p = document.createElement("option");
      p.value = "";
      p.textContent = "Class chuno";
      sel.appendChild(p);
    }
    activeClasses().forEach((c) => {
      const o = document.createElement("option");
      o.value = c.id;
      o.textContent = c.name;
      sel.appendChild(o);
    });
  }

  function fillBatchSelect(sel, classId, withPlaceholder) {
    clearNode(sel);
    if (withPlaceholder) {
      const p = document.createElement("option");
      p.value = "";
      p.textContent = classId ? "Batch chuno" : "Pehle class chuno";
      p.disabled = true;
      sel.appendChild(p);
    }
    let any = false;
    activeBatches().forEach((b) => {
      if (b.class_id !== classId) return;
      any = true;
      const o = document.createElement("option");
      o.value = b.id;
      o.textContent = b.name;
      sel.appendChild(o);
    });
    if (!any && withPlaceholder) {
      sel.firstChild.textContent = "Is class me koi batch nahi";
    }
  }

  function openAddModal() {
    const err = $("studentFormError");
    if (err) { err.textContent = ""; err.classList.remove("show"); }
    $("studentForm").reset();
    fillClassSelect($("studentClassSelect"), true);
    fillBatchSelect($("studentBatchSelect"), null, true);
    $("studentModalOverlay").classList.add("open");
    $("studentNameInput").focus();
  }

  async function saveStudent(e) {
    e.preventDefault();
    if (state.addBusy) return;
    const errBox = $("studentFormError");
    errBox.textContent = "";
    errBox.classList.remove("show");

    const fullName = $("studentNameInput").value.trim();
    const batchId = $("studentBatchSelect").value;
    const feeRaw = $("studentFeeInput").value.trim();
    const parentName = $("parentNameInput").value.trim();
    const phoneRaw = $("parentPhoneInput").value.trim();
    const school = $("studentSchoolInput").value.trim();
    const notes = $("studentNotesInput").value.trim();
    const optIn = $("parentOptInInput").checked;

    function showErr(m) {
      errBox.textContent = m;
      errBox.classList.add("show");
    }

    if (!fullName) return showErr("Naam likhna zaroori hai");
    if (!batchId) return showErr("Class aur batch chuno");

    let fee = 0;
    if (feeRaw) {
      fee = Number(feeRaw);
      if (!Number.isFinite(fee) || fee < 0) return showErr("Fee 0 ya usse upar honi chahiye");
    }

    let phone = null;
    if (phoneRaw) {
      phone = normalizePhone(phoneRaw);
      if (phone === "") return showErr("Phone galat hai. 10 digit number likho (91 khud lag jayega)");
    }
    if (optIn && !phone) return showErr("WhatsApp consent ke liye parent ka phone chahiye");

    const saveBtn = $("saveStudentBtn");
    setButtonBusy(saveBtn, true, "Saving...", "Save");
    state.addBusy = true;

    try {
      let res = await sb.rpc("create_student_with_enrollment", {
        p_full_name: fullName,
        p_batch_id: batchId,
        p_fee_total: fee,
        p_parent_name: parentName || null,
        p_parent_phone: phone,
        p_parent_opt_in: optIn,
        p_school: school || null,
        p_notes: notes || null,
        p_force: false,
      });
      if (res.error) throw res.error;
      const out = res.data;
      if (out && out.ok === false && out.warning === "duplicate") {
        const parts = [];
        if (out.same_parent_phone) parts.push("same parent phone");
        if (out.same_name_in_batch) parts.push("same naam isi batch me");
        const go = window.confirm("Ye student pehle se lag raha hai (" + parts.join(" aur ") + ").\nPhir bhi add karna hai? (jaise siblings)");
        if (!go) return;
        res = await sb.rpc("create_student_with_enrollment", {
          p_full_name: fullName, p_batch_id: batchId, p_fee_total: fee,
          p_parent_name: parentName || null, p_parent_phone: phone,
          p_parent_opt_in: optIn, p_school: school || null, p_notes: notes || null,
          p_force: true,
        });
        if (res.error) throw res.error;
      }
      showToast("Student add ho gaya", "success");
      $("studentModalOverlay").classList.remove("open");
      await loadAll();
    } catch (err) {
      showErr(plainError(err));
    } finally {
      state.addBusy = false;
      setButtonBusy(saveBtn, false, "", "Save");
    }
  }

  // ---------- Edit Student ----------
  async function openEditModal(row) {
    state.editStudentId = row.student_id;
    const err = $("editStudentError");
    if (err) { err.textContent = ""; err.classList.remove("show"); }
    $("editNameInput").value = row.student_name || "";
    $("editParentNameInput").value = row.parent_name || "";
    $("editParentPhoneInput").value = row.parent_phone || "";
    $("editOptInInput").checked = !!row.parent_opt_in;
    // school/notes view me nahi hote — fresh students row fetch karo
    $("editSchoolInput").value = "";
    $("editNotesInput").value = "";
    $("editStudentOverlay").classList.add("open");
    $("editNameInput").focus();
    try {
      const res = await sb.from("students").select("school, notes").eq("id", row.student_id).single();
      if (res.error) throw res.error;
      $("editSchoolInput").value = (res.data && res.data.school) || "";
      $("editNotesInput").value = (res.data && res.data.notes) || "";
    } catch {
      // school/notes blank rahenge; save pe null nahi jayenge (see saveEditStudent)
    }
  }

  async function saveEditStudent(e) {
    e.preventDefault();
    if (state.editBusy || !state.editStudentId) return;
    const errBox = $("editStudentError");
    errBox.textContent = "";
    errBox.classList.remove("show");

    const fullName = $("editNameInput").value.trim();
    if (!fullName) {
      errBox.textContent = "Naam likhna zaroori hai";
      errBox.classList.add("show");
      return;
    }

    const phoneRaw = $("editParentPhoneInput").value.trim();
    let phone = null;
    if (phoneRaw) {
      phone = normalizePhone(phoneRaw);
      if (phone === "") {
        errBox.textContent = "Phone galat hai. 10 digit number likho (91 khud lag jayega)";
        errBox.classList.add("show");
        return;
      }
    }

    const saveBtn = $("saveEditStudentBtn");
    setButtonBusy(saveBtn, true, "Saving...", "Save");
    state.editBusy = true;
    try {
      const payload = {
        full_name: fullName,
        parent_name: $("editParentNameInput").value.trim() || null,
        parent_phone: phone,
        parent_opt_in: $("editOptInInput").checked,
      };
      const res = await sb.from("students").update(payload).eq("id", state.editStudentId);
      if (res.error) throw res.error;
      // school/notes alag update — sirf tab jab fetch se aa chuke hain
      const sRes = await sb.from("students").update({
        school: $("editSchoolInput").value.trim() || null,
        notes: $("editNotesInput").value.trim() || null,
      }).eq("id", state.editStudentId);
      if (sRes.error) throw sRes.error;
      showToast("Student update ho gaya", "success");
      $("editStudentOverlay").classList.remove("open");
      if (window.EDU_PROFILE && window.EDU_PROFILE.onStudentEdited) window.EDU_PROFILE.onStudentEdited();
      await loadAll();
    } catch (err) {
      errBox.textContent = plainError(err);
      errBox.classList.add("show");
    } finally {
      state.editBusy = false;
      setButtonBusy(saveBtn, false, "", "Save");
    }
  }

  // ---------- Archive student ----------
  async function archiveStudent(row) {
    const go = window.confirm(row.student_name + " ko archive karna hai?\nStudent list se chhup jayega, data safe rahega. Restore kar sakte ho.");
    if (!go) return;
    try {
      const res = await sb.from("students").update({ archived_at: new Date().toISOString() }).eq("id", row.student_id);
      if (res.error) throw res.error;
      showToast("Student archive ho gaya", "success");
      await loadAll();
    } catch (err) {
      showToast(plainError(err), "error");
    }
  }

  // ---------- public API (student_profile.js uses these) ----------
  window.EDU_STUDENTS = {
    loadAll,
    openEditModal,
    normalizePhone,
    plainError,
    showToast,
    activeClasses,
    activeBatches,
    fillClassSelect,
    fillBatchSelect,
    fmtDate,
    money,
    state,
  };

  // ---------- events ----------
  function bind() {
    const addBtn = $("addStudentBtn");
    if (addBtn) addBtn.addEventListener("click", openAddModal);
    const sf = $("studentForm");
    if (sf) sf.addEventListener("submit", saveStudent);
    const cs = $("studentClassSelect");
    if (cs) cs.addEventListener("change", () => fillBatchSelect($("studentBatchSelect"), cs.value, true));
    $("closeStudentModalBtn").addEventListener("click", () => $("studentModalOverlay").classList.remove("open"));
    $("cancelStudentBtn").addEventListener("click", () => $("studentModalOverlay").classList.remove("open"));

    const ef = $("editStudentForm");
    if (ef) ef.addEventListener("submit", saveEditStudent);
    $("closeEditStudentBtn").addEventListener("click", () => $("editStudentOverlay").classList.remove("open"));
    $("cancelEditStudentBtn").addEventListener("click", () => $("editStudentOverlay").classList.remove("open"));

    const tg = $("toggleShowArchivedStudents");
    if (tg) tg.addEventListener("change", () => { state.showArchived = !!tg.checked; render(); });

    const nav = $("navStudents");
    if (nav) nav.addEventListener("click", loadAll);
  }

  bind();
  loadAll();
})();
