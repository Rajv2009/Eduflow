// EduFlow OS frontend: Supabase client + startup self-check
// Load order in index.html: supabase-js CDN (pinned) FIRST -> config.js -> supabase.js -> app.js
// IMPORTANT: the client variable is named `sb`, NOT `supabase`.
// A top-level `var supabase` in a classic script would overwrite the CDN's
// window.supabase library namespace and break everything (createClient would vanish).
// Keys: only SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY (anon/publishable) in the browser.
// Never a service_role/secret key here.

var sb = null; // null = client could not be created; app.js guards against this
var SB_INIT_ERROR = "";

(function initSupabase() {
  "use strict";

  function bootFail(msg) {
    SB_INIT_ERROR = msg;
    var box = document.getElementById("bootStatus");
    if (box) {
      box.textContent = msg;
      box.style.display = "block";
    }
  }

  function isValidKey(key) {
    if (typeof key !== "string") return false;
    // New publishable format: sb_publishable_ + project ref + long suffix
    if (key.indexOf("sb_publishable_") === 0 && key.length >= 30) return true;
    // Legacy anon JWT: starts with eyJ, long enough to be a full JWT
    if (key.indexOf("eyJ") === 0 && key.length >= 100) return true;
    return false;
  }

  // (a) Library missing? (CDN namespace check only — never overwritten now)
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    bootFail("Setup error (a): Supabase library (CDN) load nahi hui. Internet/network block check karo, ya page reload karo.");
    return;
  }

  // (b) URL or key empty/missing?
  if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") {
    bootFail("Setup error (b): config.js load nahi hui ya SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY missing hain. File save hui? Reload karo.");
    return;
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL)) {
    bootFail("Setup error (b): SUPABASE_URL khali/galat hai. Real URL bharo (https://xxxxx.supabase.co) — save + reload.");
    return;
  }
  if (!isValidKey(SUPABASE_PUBLISHABLE_KEY)) {
    bootFail("Setup error (b): SUPABASE_PUBLISHABLE_KEY khali/adhoori hai. Poori key paste karo (sb_publishable_... ya eyJ... se shuru) — save + reload.");
    return;
  }

  // (c) createClient threw?
  try {
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  } catch (e) {
    var detail = (e && e.message) ? String(e.message) : String(e);
    bootFail("Setup error (c): createClient fail hua — " + detail + " | Config values dobara check karo — save + reload.");
  }
})();
