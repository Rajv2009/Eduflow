// EduFlow OS — app.js (Step 1: auth + shell navigation)
// Rules: user data via textContent only; no sign-up; errors in plain Hinglish.
// Auth check at startup uses supabase.auth.getUser() (verifies with server,
// not just local storage) so an expired session never shows the app.
// Guard: if the Supabase client failed to init (supabase.js self-check),
// we never call supabase.auth.* and show a plain setup error instead.

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- Toast ----------
  function showToast(msg, type) {
    const t = document.createElement("div");
    t.className = "toast " + (type || "");
    t.textContent = msg;
    $("toastContainer").appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  // ---------- Error to plain message ----------
  function plainError(err) {
    const m = (err && (err.message || err.error_description)) || "Kuch galat ho gaya. Dobara try karo.";
    return m;
  }

  // ---------- App show/hide ----------
  function showApp(user) {
    $("loginScreen").style.display = "none";
    $("app").style.display = "block";
    const name = (user.email || "Owner").split("@")[0];
    $("userName").textContent = name;
    $("userAvatar").textContent = (name[0] || "O").toUpperCase();
  }

  function showLogin() {
    $("app").style.display = "none";
    $("loginScreen").style.display = "flex";
  }

  // ---------- Navigation ----------
  function showPage(pageId, navEl) {
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    const page = $("page-" + pageId);
    if (page) page.classList.add("active");
    document.querySelectorAll("..nav-item[data-page]").forEach((n) => n.classList.remove("active"));
    if (navEl) navEl.classList.add("active");
  }

  document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
    item.addEventListener("click", () => showPage(item.dataset.page, item));
  });

  document.querySelectorAll(".nav-item[data-soon]").forEach((item) => {
    item.addEventListener("click", () => showToast("Ye page coming soon hai 🚧", "warn"));
  });

  // ---------- Guard: Supabase client missing? ----------
  if (typeof supabase === "undefined" || !supabase || !supabase.auth) {
    // supabase.js self-check already wrote a clear message into #bootStatus.
    // Disable login so the raw crash never reaches the user.
    const btn = $("loginBtn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Setup error — config check karo";
    }
    return; // Do not bind login/session code below.
  }

  // ---------- Login ----------
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("loginBtn");
    const errBox = $("loginError");
    errBox.classList.remove("show");
    btn.disabled = true;
    btn.textContent = "Logging in…";
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: $("loginEmail").value.trim(),
        password: $("loginPassword").value,
      });
      if (error) throw error;
      // onAuthStateChange handler will show the app
    } catch (err) {
      errBox.textContent = "Login fail: " + plainError(err);
      errBox.classList.add("show");
    } finally {
      btn.disabled = false;
      btn.textContent = "Login";
    }
  });

  // ---------- Logout ----------
  $("logoutBtn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    showLogin();
    showToast("Logout ho gaya. Bye!", "success");
  });

  // ---------- Session watcher ----------
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) showApp(session.user);
    if (event === "SIGNED_OUT") showLogin();
  });

  // ---------- Startup: verify session with server ----------
  (async function init() {
    try {
      const { data } = await supabase.auth.getUser();
      if (data && data.user) showApp(data.user);
      else showLogin();
    } catch {
      showLogin();
    }
  })();
})();
