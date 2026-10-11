// EduFlow OS frontend: Supabase client + startup self-check
// Load order in index.html: config.js -> supabase-js CDN -> supabase.js -> app.js
// Only SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are used. Never a service_role key in the browser.
// Key formats accepted (both are safe publishable keys):
//   - New: sb_publishable_...  (Supabase's newer publishable key format)
//   - Legacy: eyJhbGciOi...    (classic anon JWT, still valid on older projects)

var supabase = null; // null means client could not be created; app.js guards against this
var SUPABASE_INIT_ERROR = "";

(function initSupabase() {
  "use strict";

  function bootFail(msg) {
    SUPABASE_INIT_ERROR = msg;
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

  // 1) config.js loaded with values?
  if (typeof SUPABASE_URL === "undefined" || typeof SUPABASE_PUBLISHABLE_KEY === "undefined") {
    bootFail("Setup error: config.js load nahi hui ya values missing hain. File save hui? Reload karo.");
    return;
  }

  // 2) URL format valid?
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(SUPABASE_URL)) {
    bootFail("Setup error: SUPABASE_URL placeholder/galat hai. Real URL bharo: https://xxxxx.supabase.co — save + reload.");
    return;
  }

  // 3) Key format valid?
  if (!isValidKey(SUPABASE_PUBLISHABLE_KEY)) {
    bootFail("Setup error: SUPABASE_PUBLISHABLE_KEY adhoori/galat hai. Supabase dashboard se poori key copy karo (sb_publishable_... ya eyJ... se shuru) — save + reload.");
    return;
  }

  // 4) CDN library loaded?
  if (!window.supabase || !window.supabase.createClient) {
    bootFail("Setup error: Supabase library (CDN) load nahi hui. Internet check karo ya page dobara reload karo.");
    return;
  }

  // All checks passed — create the client
  try {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  } catch (e) {
    bootFail("Setup error: Supabase client create nahi hua. Config values dobara check karo — save + reload.");
  }
})();
