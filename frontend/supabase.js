// EduFlow OS frontend: Supabase client
// Load order in index.html: config.js -> supabase-js CDN -> supabase.js -> app.js
// Only SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are used. Never a service_role key in the browser.

const { createClient } = window.supabase;

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
