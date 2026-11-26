# Amend AI Smile Check (Next.js)

Patients upload 3 teeth photos and answer a short questionnaire. They get an AI oral-health
report, and the clinic gets a lead-scored admin dashboard.

| What | Where it's stored |
|---|---|
| Leads, questions, settings, share links | **MongoDB** (e.g. MongoDB Atlas) |
| Patient photos | **Bunny.net Storage**, in a *private* storage zone (shown only through expiring signed links the server creates, via `/api/photos`) |
| AI analysis | OpenAI (called from the server; the key never reaches the browser) |

The old static HTML + Google Apps Script version is kept in [`legacy/`](legacy/) for reference.

---

## 1. Create the accounts (one time)

**MongoDB Atlas** (free tier is fine)
1. Go to <https://cloud.mongodb.com>, create a free cluster.
2. *Database Access* → add a user with a password.
3. *Network Access* → add your server's IP (or `0.0.0.0/0` to allow anywhere).
4. *Connect → Drivers* → copy the connection string. Add a database name before the `?`, e.g.
   `mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/amend-smile-check?retryWrites=true&w=majority`

**Bunny.net Storage**
1. Sign up at <https://bunny.net>, then go to **Storage → Add Storage Zone**. Pick a region close to
   your patients (e.g. Singapore for India).
2. Open the zone → **FTP & API Access** and copy the **zone name**, the **password** (this is the storage
   API key, *not* your account API key) and the **hostname** (e.g. `sg.storage.bunnycdn.com`).
3. **Don't connect a Pull Zone** to it. That would make the photos public. The app serves them itself.

**OpenAI**: an API key with access to `gpt-4o` (you can also paste it later in Admin → Settings).

## 2. Run it on your PC

```bash
npm install
cp .env.example .env.local     # on Windows: copy .env.example .env.local
# edit .env.local and fill in the values
npm run dev
```

Open <http://localhost:3000>. Admin: <http://localhost:3000/admin>, where you log in with
`SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` from `.env.local`.

### Admin roles

| | Super Admin | Team user |
|---|---|---|
| Who | One person, set **only** in env vars (`SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`) | Created by the Super Admin in **Settings → Team users** |
| All leads, "Showing" filter by user, reassign/delete leads | ✅ | ✅ |
| Share links (with an owner per link) | ✅ | ✅ |
| Questions, AI/branding settings | ✅ | ✅ |
| **Create / edit / deactivate / delete team users** | ✅ | ❌ |
| Change own password | in env vars | in Settings |

- A lead is assigned to whoever owns the share link the patient used (`/test?ref=code`). Leads from
  links without an owner, or with no link, are **unassigned**. Anyone can assign them on the lead page.
- Deactivating a user, resetting their password, or deleting them signs them out immediately.
  Deleting a user keeps their leads and links, which become unassigned.
- To change the Super Admin login, edit the env vars and restart. Old Super Admin sessions stop working.
- Failed logins are rate-limited (8 tries per 15 minutes per IP and email).

## 3. Environment variables

See [`.env.example`](.env.example) for all of them. Required:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_API_KEY`, `BUNNY_STORAGE_HOST` | Bunny storage zone name, its password, and its region hostname |
| `AUTH_SECRET` | Long random string (32+ chars) that signs admin sessions |
| `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` | Super Admin login (full access; never stored in the database) |

Optional: `OPENAI_API_KEY`, `OPENAI_MODEL`, `BUNNY_STORAGE_FOLDER`, and the `NEXT_PUBLIC_*` branding/links
(clinic name, website, booking link, branches). `NEXT_PUBLIC_*` values are baked in at build time,
so **rebuild after changing them**.

## 4. Deploy

This is a Node.js app (it has a server and admin backend). **Hostinger's plain shared hosting
can't run it.** Use one of these:

### Hostinger: Business/Cloud plan (Node.js Web App) or VPS
1. Push this repo to GitHub.
2. **Node.js app (hPanel):** *Websites → Add website → Node.js Apps* → import from GitHub. Build
   command `npm run build`, start command `npm start`, Node 20+. Add all environment variables
   from `.env.example` in the app's settings, then deploy.
3. **VPS:** install Node 20+, clone the repo, create `.env.local`, then
   `npm ci && npm run build && npx pm2 start npm --name smile -- start`. Put Nginx in front
   (proxy to port 3000) with `client_max_body_size 10m;` (photo uploads are ~1 MB) and
   `proxy_read_timeout 180s;` (the AI step takes 20–40 s). Add free SSL with Certbot.
4. In MongoDB Atlas → *Network Access*, allow your server's IP.

### Vercel (simplest alternative)
Import the GitHub repo at <https://vercel.com/new>, add the environment variables, deploy.

**HTTPS is required in production.** The admin login cookie is `Secure`, so login won't stick
on plain `http://`.

## 5. Pages

| URL | What |
|---|---|
| `/` | Landing page (`/?ref=instagram` passes the source through) |
| `/test` | The Smile Check: photos → questions → contact details |
| `/report/<id>` | Patient's report (no phone/email/staff notes; hidden from search engines) |
| `/admin` | Dashboard: KPIs, "contact these first" queue, pipeline, charts, lead table, CSV export |
| `/admin/leads/<id>` | One lead: photos, AI findings, internal consultation angle, stage, notes, delete |
| `/admin/questions` | Edit the questionnaire |
| `/admin/links` | Trackable share links (`/test?ref=code`) |
| `/admin/settings` | Super Admin: brand name, OpenAI key/model, **team users**. Team user: change own password |

Old links (`test.html`, `report.html?id=…`, `index.html`) redirect to the new pages. Leads from
the old Google Sheet were **not** imported, so old report links show "Report not found".

## 6. Tests

```bash
npm test        # scoring, questionnaire and session logic
npm run build   # full compile check
```
