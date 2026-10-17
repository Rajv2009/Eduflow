// EduFlow OS — app.js (Step 1: auth + shell; Step 3 fb: mobile drawer, soon-group, formatters)
// Rules: user data via textContent only; no sign-up; errors in plain Hinglish.
// IMPORTANT: the client is `sb` (created in supabase.js). We never reference a
// variable named `supabase` — that name belongs to the CDN library namespace.
// Startup auth check uses sb.auth.getUser() (server-verified, not local storage)
// so an expired session never shows the app.

(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ---------- Shared formatters (window.EDU) ----------
  // INR money without decimals: 30000 -> "₹30,000"
  function moneyINR(v) {
    const n = Number(v || 0);
    if (!Number.isFinite(n)) return "₹0";
    return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }
  // Phone "919812345606" -> "+91 98123 45606"
  function fmtPhone(v) {
    const d = String(v || "").replace(/\D/g, "");
    if (d.length === 12 && d.startsWith("91")) {
      return "+91 " + d.slice(2, 7) + " " + d.slice(7);
    }
    if (d.length === 10) {
      return "+91 " + d.slice(0, 5) + " " + d.slice(5);
    }
    return v || "—";
  }

  window.EDU = { money: moneyINR, phone: fmtPhone };

  // ---------- Toast ----------
  function showToast(msg, type) {
    const t = document.createElement("div");
    t.className = "toast " + (type || "");
    t.textContent = msg;
    $("toastContainer").appendChild(t);
    setTimeout(() => t.remove(), 3500);
  }

  window.EDU.showToast = showToast;

  // ---------- Error to plain message ----------
  function plainError(err) {
    const m = (err && (err.message || err.error_description)) || "Kuch galat ho gaya. Dobara try karo.";
    return m;
  }
  window.EDU.plainError = plainError;

  // ---------- Mobile drawer ----------
  function closeDrawer() {
    const sb = $("sidebar");
    const bd = $("sidebarBackdrop");
    if (sb) sb.classList.remove("open");
    if (bd) bd.classList.remove("show");
  }

  function openDrawer() {
    $("sidebar").classList.add("open");
    $("sidebarBackdrop").classList.add("show");
  }

  const hb = $("hamburgerBtn");
  if (hb) hb.addEventListener("click", () => {
    if ($("sidebar").classList.contains("open")) closeDrawer();
    else openDrawer();
  });
  const bd = $("sidebarBackdrop");
  if (bd) bd.addEventListener("click", closeDrawer);

  // ---------- "Aane wale features" collapsed group ----------
  const soonHead = $("soonGroupHead");
  if (soonHead) {
    soonHead.addEventListener("click", () => {
      $("soonGroupList").classList.toggle("open");
      const chev = $("soonGroupChev");
      if (chev) chev.textContent = $("soonGroupList").classList.contains("open") ? "▾" : "▸";
    });
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
    closeDrawer();
  }

  // ---------- Navigation ----------
  function showPage(pageId, navEl) {
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    const page = $("page-" + pageId);
    if (page) page.classList.add("active");
    document.querySelectorAll(".nav-item[data-page]").forEach((n) => n.classList.remove("active"));
    if (navEl) navEl.classList.add("active");
    closeDrawer();
  }

  document.querySelectorAll(".nav-item[data-page]").forEach((item) => {
    item.addEventListener("click", () => showPage(item.dataset.page, item));
  });

  document.querySelectorAll(".nav-item[data-soon]").forEach((item) => {
    item.addEventListener("click", () => showToast("Ye page coming soon hai 🚧", "warn"));
  });

  // ---------- Guard: Supabase client missing? ----------
  if (typeof sb === "undefined" || !sb || !sb.auth) {
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
      const { error } = await sb.auth.signInWithPassword({
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
    await sb.auth.signOut();
    showLogin();
    showToast("Logout ho gaya. Bye!", "success");
  });

  // ---------- Session watcher ----------
  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && session) showApp(session.user);
    if (event === "SIGNED_OUT") showLogin();
  });

  // ---------- Startup: verify session with server ----------
  (async function init() {
    try {
      const { data } = await sb.auth.getUser();
      if (data && data.user) showApp(data.user);
      else showLogin();
    } catch {
      showLogin();
    }
  })();
})();
