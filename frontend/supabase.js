// EduFlow OS frontend: Supabase client + startup self-check
// Load order in index.html: config.js -> supabase-js CDN -> supabase.js -> app.js
// Only SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are used. Never a service_role key in the browser.

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

  // 3) Key format valid? (publishable/anon key is a long JWT starting with eyJ)
  if (typeof SUPABASE_PUBLISHABLE_KEY !== "string" || SUPABASE_PUBLISHABLE_KEY.indexOf("eyJ") !== 0 || SUPABASE_PUBLISHABLE_KEY.length < 100) {
    bootFail("Setup error: SUPABASE_PUBLISHABLE_KEY adhoori/galat hai. Poori lambi key (eyJ... se shuru) paste karo — save + reload.");
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
