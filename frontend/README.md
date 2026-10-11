# EduFlow OS — Frontend

Vanilla JS + Supabase (v2). No build step. Open `index.html` after filling in config.

## Setup (local)

1. `config.js` kholo aur placeholders bharo:
   - `SUPABASE_URL` = tumhare Supabase project ka URL (Dashboard → Settings → API → Project URL)
   - `SUPABASE_PUBLISHABLE_KEY` = publishable/anon key (Settings → API)
2. Koi local server chalao (direct file:// kholne se module/CORS issues aa sakte hain):
   - `npx serve .` ya VS Code "Live Server" extension
3. Browser mein kholo → login screen dikhegi.

## Security rules (important)

- Browser mein sirf **URL + publishable (anon) key**. **service_role / secret key KABHI nahi.**
- User data hamesha `textContent` se render hota hai, `innerHTML` kabhi nahi.
- Payments sirf `rpc('add_payment')` / `rpc('cancel_payment')` se.
- Sign-up screen nahi hai; owner Supabase Auth settings se banaya jata hai ("Allow new users to sign up" OFF).

## Deploy preview

### Netlify
1. https://app.netlify.com → "Add new site" → "Import an existing project"
2. Git provider → GitHub → repo `Rajv2009/Eduflow` → branch `dev` → base directory `frontend`
   (ya drag-and-drop: `frontend` folder ko https://app.netlify.com/drop pe drop kar do)
3. Build command: (blank) | Publish directory: `frontend`
4. Deploy → Site settings → "Site configuration" se URL mil jayegi (jaise `xyz.netlify.app`)

### Cloudflare Pages
1. https://dash.cloudflare.com → Workers & Pages → "Create" → Pages → "Connect to Git"
2. Repo `Rajv2009/Eduflow` select karo → Branch: `dev`
3. Build settings: Framework preset = "None", Build command = (blank), Build output directory = `frontend`
4. Save and Deploy → URL milegi (`xyz.pages.dev`)

Deploy ke baad: `config.js` ki real values **local/dep dashboard** mein bharo ya Netlify/CF Pages dashboard se file edit karo — real key Git mein kabhi commit mat karo.
