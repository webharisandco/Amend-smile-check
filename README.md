# Amend AI Smile Check (Next.js)

Patients upload 3 teeth photos and answer a short questionnaire. They get an AI oral-health
report, and the clinic gets a lead-scored admin dashboard.

| What | Where it's stored |
|---|---|
| Leads, questions, settings, share links | **MongoDB** (e.g. MongoDB Atlas) |
| Patient photos | **Cloudinary**, as *private* images (viewable only through signed links the server creates) |
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

**Cloudinary**
1. Sign up at <https://cloudinary.com>.
2. Dashboard → copy the **API environment variable** (`cloudinary://KEY:SECRET@CLOUD_NAME`).

**OpenAI**: an API key with access to `gpt-4o` (you can also paste it later in Admin → Settings).

## 2. Run it on your PC

```bash
npm install
cp .env.example .env.local     # on Windows: copy .env.example .env.local
# edit .env.local and fill in the values
npm run dev
```

Open <http://localhost:3000>. Admin: <http://localhost:3000/admin>, where you log in with
`ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env.local`.

The admin account is created from those two variables **the first time the app starts**. After
that, change the username/password in **Admin → Settings**; editing `.env.local` again won't
change an existing account.

## 3. Environment variables

See [`.env.example`](.env.example) for all of them. Required:

| Variable | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB connection string |
| `CLOUDINARY_URL` | Cloudinary credentials |
| `AUTH_SECRET` | Long random string (32+ chars) that signs admin sessions |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | First admin account |

Optional: `OPENAI_API_KEY`, `OPENAI_MODEL`, `CLOUDINARY_FOLDER`, and the `NEXT_PUBLIC_*` branding/links
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
| `/admin/settings` | Brand name, OpenAI key/model, admin username/password |

Old links (`test.html`, `report.html?id=…`, `index.html`) redirect to the new pages. Leads from
the old Google Sheet were **not** imported, so old report links show "Report not found".

## 6. Tests

```bash
npm test        # scoring, questionnaire and session logic
npm run build   # full compile check
```
