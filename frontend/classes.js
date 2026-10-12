// EduFlow OS — classes.js (Step 2: Classes & Batches only)
// Rules followed: client = sb, textContent-only rendering, no delete paths,
// archive/restore only, created_at ordering, duplicate 23505 => plain Hinglish.

(function () {
  "use strict";

  if (typeof sb === "undefined" || !sb) return;

  const $ = (id) => document.getElementById(id);

  const state = {
    classes: [],
    batches: [],
    showArchivedClasses: false,
    showArchivedBatches: false,
    classEditId: null,
    batchEditId: null,
    batchClassId: null,
    loading: false,
  };

  function showToast(msg, type) {
    const host = $("toastContainer");
    if (!host) return;
    const t = document.createElement("div");
    t.className = "toast " + (type || "");
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(function () {
      t.remove();
    }, 3500);
  }

  function clearNode(node) {
    while (node && node.firstChild) node.removeChild(node.firstChild);
  }

  function mapDbError(error) {
    if (error && String(error.code) === "23505") return "Ye naam pehle se hai";
    return (error && (error.message || error.details)) || "Kuch galat ho gaya. Dobara try karo.";
  }

  function setButtonBusy(btn, busy, busyText, normalText) {
    if (!btn) return;
    btn.disabled = !!busy;
    btn.textContent = busy ? busyText : normalText;
  }

  function formatFee(v) {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return "₹0";
    return "₹" + n.toFixed(2);
  }

  function getClassById(id) {
    for (let i = 0; i < state.classes.length; i += 1) {
      if (state.classes[i].id === id) return state.classes[i];
    }
    return null;
  }

  function openClassModal(editClass) {
    state.classEditId = editClass ? editClass.id : null;
    const title = $("classModalTitle");
    const input = $("classNameInput");
    const err = $("classFormError");
    if (title) title.textContent = editClass ? "Rename Class" : "Add Class";
    if (input) input.value = editClass ? (editClass.name || "") : "";
    if (err) {
      err.classList.remove("show");
      err.textContent = "";
    }
    const overlay = $("classModalOverlay");
    if (overlay) overlay.classList.add("open");
    if (input) input.focus();
  }

  function closeClassModal() {
    const overlay = $("classModalOverlay");
    if (overlay) overlay.classList.remove("open");
  }

  function openBatchModal(classId, editBatch) {
    state.batchClassId = classId;
    state.batchEditId = editBatch ? editBatch.id : null;

    const cls = getClassById(classId);
    const title = $("batchModalTitle");
    const className = $("batchModalClassName");
    const err = $("batchFormError");

    if (title) title.textContent = editBatch ? "Edit Batch" : "Add Batch";
    if (className) className.textContent = cls ? ("Class: " + cls.name) : "";

    $("batchNameInput").value = editBatch ? (editBatch.name || "") : "";
    $("batchDefaultFeeInput").value = editBatch ? Number(editBatch.default_fee || 0).toFixed(2) : "0.00";
    $("batchTimingNoteInput").value = editBatch ? (editBatch.timing_note || "") : "";

    if (err) {
      err.classList.remove("show");
      err.textContent = "";
    }

    const overlay = $("batchModalOverlay");
    if (overlay) overlay.classList.add("open");
    $("batchNameInput").focus();
  }

  function closeBatchModal() {
    const overlay = $("batchModalOverlay");
    if (overlay) overlay.classList.remove("open");
  }

  async function loadData() {
    if (state.loading) return;
    state.loading = true;

    const host = $("classesList");
    if (host) {
      clearNode(host);
      const s = document.createElement("div");
      s.className = "empty-state";
      s.textContent = "Loading classes...";
      host.appendChild(s);
    }

    try {
      const cRes = await sb
        .from("classes")
        .select("id, name, archived_at, created_at")
        .order("created_at", { ascending: true });
      if (cRes.error) throw cRes.error;

      const bRes = await sb
        .from("batches")
        .select("id, class_id, name, default_fee, timing_note, archived_at, created_at")
        .order("created_at", { ascending: true });
      if (bRes.error) throw bRes.error;

      state.classes = cRes.data || [];
      state.batches = bRes.data || [];
      render();
    } catch (err) {
      if (host) {
        clearNode(host);
        const e = document.createElement("div");
        e.className = "empty-state";
        e.textContent = "Load fail: " + mapDbError(err);
        host.appendChild(e);
      }
    } finally {
      state.loading = false;
    }
  }

  function buildClassCard(cls) {
    const card = document.createElement("div");
    card.className = "card class-card";

    const head = document.createElement("div");
    head.className = "card-header";

    const titleWrap = document.createElement("div");
    titleWrap.className = "class-title-wrap";

    const title = document.createElement("div");
    title.className = "class-title";
    title.textContent = cls.name;
    titleWrap.appendChild(title);

    if (cls.archived_at) {
      const badge = document.createElement("span");
      badge.className = "badge badge-muted";
      badge.textContent = "Archived";
      titleWrap.appendChild(badge);
    }

    const actions = document.createElement("div");
    actions.className = "class-actions";

    const addBatchBtn = document.createElement("button");
    addBatchBtn.className = "btn btn-secondary btn-sm";
    addBatchBtn.type = "button";
    addBatchBtn.textContent = "Add Batch";
    addBatchBtn.disabled = !!cls.archived_at;
    addBatchBtn.addEventListener("click", function () {
      openBatchModal(cls.id, null);
    });

    const renameBtn = document.createElement("button");
    renameBtn.className = "btn btn-secondary btn-sm";
    renameBtn.type = "button";
    renameBtn.textContent = "Rename";
    renameBtn.addEventListener("click", function () {
      openClassModal(cls);
    });

    const arcBtn = document.createElement("button");
    arcBtn.className = "btn btn-sm " + (cls.archived_at ? "btn-secondary" : "btn-danger");
    arcBtn.type = "button";
    arcBtn.textContent = cls.archived_at ? "Restore" : "Archive";
    arcBtn.addEventListener("click", function () {
      toggleClassArchive(cls, arcBtn);
    });

    actions.appendChild(addBatchBtn);
    actions.appendChild(renameBtn);
    actions.appendChild(arcBtn);

    head.appendChild(titleWrap);
    head.appendChild(actions);

    const body = document.createElement("div");
    body.className = "card-body";

    const sub = document.createElement("div");
    sub.className = "section-sub";
    sub.textContent = "Batches";
    body.appendChild(sub);

    const batchWrap = document.createElement("div");
    batchWrap.className = "batch-list";

    const list = [];
    for (let i = 0; i < state.batches.length; i += 1) {
      const b = state.batches[i];
      if (b.class_id !== cls.id) continue;
      if (!state.showArchivedBatches && b.archived_at) continue;
      list.push(b);
    }

    if (list.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = state.showArchivedBatches
        ? "Is class me abhi koi batch nahi hai."
        : "No active batches. Add Batch dabao.";
      batchWrap.appendChild(empty);
    } else {
      const grid = document.createElement("div");
      grid.className = "batch-grid";

      for (let j = 0; j < list.length; j += 1) {
        const bRow = list[j];
        const bCard = document.createElement("div");
        bCard.className = "batch-card";

        const bTitle = document.createElement("div");
        bTitle.className = "batch-title";
        bTitle.textContent = bRow.name;
        bCard.appendChild(bTitle);

        const meta = document.createElement("div");
        meta.className = "batch-meta";

        const fee = document.createElement("span");
        fee.textContent = "Default fee: " + formatFee(bRow.default_fee);
        meta.appendChild(fee);

        const time = document.createElement("span");
        time.textContent = "Timing: " + (bRow.timing_note || "—");
        meta.appendChild(time);

        bCard.appendChild(meta);

        if (bRow.archived_at) {
          const bBadge = document.createElement("span");
          bBadge.className = "badge badge-muted";
          bBadge.style.marginTop = "8px";
          bBadge.textContent = "Archived";
          bCard.appendChild(bBadge);
        }

        const bActions = document.createElement("div");
        bActions.className = "batch-actions";

        const editBtn = document.createElement("button");
        editBtn.className = "btn btn-secondary btn-sm";
        editBtn.type = "button";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", function () {
          openBatchModal(cls.id, bRow);
        });

        const bArcBtn = document.createElement("button");
        bArcBtn.className = "btn btn-sm " + (bRow.archived_at ? "btn-secondary" : "btn-danger");
        bArcBtn.type = "button";
        bArcBtn.textContent = bRow.archived_at ? "Restore" : "Archive";
        bArcBtn.addEventListener("click", function () {
          toggleBatchArchive(bRow, bArcBtn);
        });

        bActions.appendChild(editBtn);
        bActions.appendChild(bArcBtn);
        bCard.appendChild(bActions);

        grid.appendChild(bCard);
      }

      batchWrap.appendChild(grid);
    }

    body.appendChild(batchWrap);

    card.appendChild(head);
    card.appendChild(body);
    return card;
  }

  function render() {
    const host = $("classesList");
    if (!host) return;
    clearNode(host);

    const visible = [];
    for (let i = 0; i < state.classes.length; i += 1) {
      const c = state.classes[i];
      if (!state.showArchivedClasses && c.archived_at) continue;
      visible.push(c);
    }

    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = state.showArchivedClasses
        ? "Koi class nahi mili."
        : "No active classes. Add Class dabao.";
      host.appendChild(empty);
      return;
    }

    for (let i = 0; i < visible.length; i += 1) {
      host.appendChild(buildClassCard(visible[i]));
    }
  }

  async function toggleBatchArchive(bRow, btn) {
    const doRestore = !!bRow.archived_at;
    const original = btn ? btn.textContent : "";
    setButtonBusy(btn, true, doRestore ? "Restoring..." : "Archiving...", original);
    try {
      const payload = { archived_at: doRestore ? null : new Date().toISOString() };
      const res = await sb.from("batches").update(payload).eq("id", bRow.id);
      if (res.error) throw res.error;
      showToast(doRestore ? "Batch restore ho gaya" : "Batch archive ho gaya", "success");
      await loadData();
    } catch (err) {
      showToast(mapDbError(err), "error");
    } finally {
      setButtonBusy(btn, false, "", original);
    }
  }

  async function getArchiveWarningsForClass(classId) {
    const bRes = await sb
      .from("batches")
      .select("id", { head: true, count: "exact" })
      .eq("class_id", classId)
      .is("archived_at", null);
    if (bRes.error) throw bRes.error;

    const sRes = await sb
      .from("v_students_overview")
      .select("student_id", { head: true, count: "exact" })
      .eq("class_id", classId);
    if (sRes.error) throw sRes.error;

    return {
      activeBatches: bRes.count || 0,
      activeStudents: sRes.count || 0,
    };
  }

  async function toggleClassArchive(cls, btn) {
    const doRestore = !!cls.archived_at;
    const original = btn ? btn.textContent : "";
    setButtonBusy(btn, true, doRestore ? "Restoring..." : "Checking...", original);

    try {
      if (!doRestore) {
        const warning = await getArchiveWarningsForClass(cls.id);
        if (warning.activeBatches > 0 || warning.activeStudents > 0) {
          const msg =
            "Is class me abhi " + warning.activeBatches + " active batch aur " + warning.activeStudents +
            " active student records mil rahe hain.\n\nPhir bhi archive karna hai?";
          const ok = window.confirm(msg);
          if (!ok) {
            setButtonBusy(btn, false, "", original);
            return;
          }
        }
      }

      setButtonBusy(btn, true, doRestore ? "Restoring..." : "Archiving...", original);
      const payload = { archived_at: doRestore ? null : new Date().toISOString() };
      const res = await sb.from("classes").update(payload).eq("id", cls.id);
      if (res.error) throw res.error;

      showToast(doRestore ? "Class restore ho gayi" : "Class archive ho gayi", "success");
      await loadData();
    } catch (err) {
      showToast(mapDbError(err), "error");
    } finally {
      setButtonBusy(btn, false, "", original);
    }
  }

  async function saveClass(e) {
    e.preventDefault();
    const nameInput = $("classNameInput");
    const errBox = $("classFormError");
    const saveBtn = $("saveClassBtn");
    const cancelBtn = $("cancelClassBtn");

    const name = nameInput.value.trim();
    if (!name) {
      errBox.textContent = "Class name required hai";
      errBox.classList.add("show");
      return;
    }

    errBox.textContent = "";
    errBox.classList.remove("show");

    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      if (state.classEditId) {
        const res = await sb.from("classes").update({ name: name }).eq("id", state.classEditId);
        if (res.error) throw res.error;
        showToast("Class update ho gayi", "success");
      } else {
        const res = await sb.from("classes").insert({ name: name });
        if (res.error) throw res.error;
        showToast("Class add ho gayi", "success");
      }
      closeClassModal();
      await loadData();
    } catch (err) {
      errBox.textContent = mapDbError(err);
      errBox.classList.add("show");
    } finally {
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  }

  async function saveBatch(e) {
    e.preventDefault();
    const name = $("batchNameInput").value.trim();
    const feeRaw = $("batchDefaultFeeInput").value.trim();
    const timingNote = $("batchTimingNoteInput").value.trim();
    const errBox = $("batchFormError");
    const saveBtn = $("saveBatchBtn");
    const cancelBtn = $("cancelBatchBtn");

    if (!name) {
      errBox.textContent = "Batch name required hai";
      errBox.classList.add("show");
      return;
    }

    const fee = Number(feeRaw);
    if (!Number.isFinite(fee) || fee < 0) {
      errBox.textContent = "Default fee 0 ya usse upar hona chahiye";
      errBox.classList.add("show");
      return;
    }

    if (!state.batchClassId) {
      errBox.textContent = "Class select nahi mili. Dobara try karo.";
      errBox.classList.add("show");
      return;
    }

    errBox.textContent = "";
    errBox.classList.remove("show");

    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      const payload = {
        class_id: state.batchClassId,
        name: name,
        default_fee: Number(fee.toFixed(2)),
        timing_note: timingNote || null,
      };

      if (state.batchEditId) {
        const res = await sb.from("batches").update(payload).eq("id", state.batchEditId);
        if (res.error) throw res.error;
        showToast("Batch update ho gaya", "success");
      } else {
        const res = await sb.from("batches").insert(payload);
        if (res.error) throw res.error;
        showToast("Batch add ho gaya", "success");
      }

      closeBatchModal();
      await loadData();
    } catch (err) {
      errBox.textContent = mapDbError(err);
      errBox.classList.add("show");
    } finally {
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
      saveBtn.textContent = "Save";
    }
  }

  function bindEvents() {
    const addClassBtn = $("addClassBtn");
    if (addClassBtn) {
      addClassBtn.addEventListener("click", function () {
        openClassModal(null);
      });
    }

    const classForm = $("classForm");
    if (classForm) classForm.addEventListener("submit", saveClass);

    const batchForm = $("batchForm");
    if (batchForm) batchForm.addEventListener("submit", saveBatch);

    const closeClass = $("closeClassModalBtn");
    if (closeClass) closeClass.addEventListener("click", closeClassModal);

    const cancelClass = $("cancelClassBtn");
    if (cancelClass) cancelClass.addEventListener("click", closeClassModal);

    const closeBatch = $("closeBatchModalBtn");
    if (closeBatch) closeBatch.addEventListener("click", closeBatchModal);

    const cancelBatch = $("cancelBatchBtn");
    if (cancelBatch) cancelBatch.addEventListener("click", closeBatchModal);

    const cToggle = $("toggleShowArchivedClasses");
    if (cToggle) {
      cToggle.addEventListener("change", function () {
        state.showArchivedClasses = !!cToggle.checked;
        render();
      });
    }

    const bToggle = $("toggleShowArchivedBatches");
    if (bToggle) {
      bToggle.addEventListener("change", function () {
        state.showArchivedBatches = !!bToggle.checked;
        render();
      });
    }

    const navClasses = $("navClasses");
    if (navClasses) {
      navClasses.addEventListener("click", function () {
        loadData();
      });
    }
  }

  bindEvents();
  loadData();
})();
