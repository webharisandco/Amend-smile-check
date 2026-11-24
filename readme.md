# Oral Health AI Test — Website

A plain HTML/CSS/JS website (no build step, no Node server) for a dental
clinic's oral-health lead-gen tool. Visitors upload 3 teeth photos, get an
AI score + a short self-reported assessment (age, symptoms, habits, history),
and you get a lead-scored admin dashboard —
backed entirely by a Google Sheet + Drive folder in your own Google account.

**The whole backend is one Google Apps Script file** (`apps-script/Code.gs`)
that lives inside your Google Sheet. There is no server to host, no
database, no Docker, no persistent disk to worry about — just static files
you can drop on Netlify, GitHub Pages, or literally any web host.

---

## Branding, links & what's in this version

All clinic-specific settings live in **`assets/js/config.js`** — the backend URL,
clinic name, website link (`WEBSITE_URL`), consultation booking link
(`BOOKING_URL`), and branch list. Change a link there and every page updates.

- **Patient report** — AI-written personal summary, 5 scored measures with rings,
  a smile-profile radar vs a healthy reference, strengths vs areas to review
  (with location + calm urgency labels), alignment map with aligner-fit callout,
  treatment recommendations mapped to Amend's services, personalised care tips,
  and booking CTAs at every natural decision point (plus a sticky mobile bar).
  Clearly labelled as AI-generated, with a full disclaimer.
- **Dashboard** — KPIs, a "Contact these first" action queue (one-tap WhatsApp
  that sends the patient their report link, auto-marks the lead Contacted),
  a clickable pipeline (New → Contacted → Booked → Converted → Dismissed),
  14-day trend, treatment-opportunity and lead-source breakdowns, inline stage
  changes in the table, and CSV export.
- **Lead page** — internal "consultation angle" pitch written by the AI (never
  shown to the patient), full AI findings, photos, stage + notes, answers.

Logo files: `assets/img/amend-logo.png` (full) and `assets/img/amend-mark.png` (round mark / favicon).

---

## How it fits together

```
Browser (static HTML/CSS/JS)  →  fetch()  →  Google Apps Script Web App
                                                  ├── Google Sheet   (leads + assessment questions)
                                                  ├── Google Drive   (uploaded photos)
                                                  ├── PropertiesService (settings: OpenAI key, admin login)
                                                  └── OpenAI API     (vision analysis, called server-side)
```

Nothing sensitive (your OpenAI key, admin password) ever touches the
browser — it all stays inside the Apps Script project, which only you can
edit.

---

## 1. Set up the backend (~5 minutes)

1. Go to https://sheets.google.com and create a **blank spreadsheet**.
   Rename it to something like "Oral Health Leads".
2. **Extensions → Apps Script**. Delete the placeholder `myFunction()` code
   and paste in the entire contents of `apps-script/Code.gs` from this
   folder.
3. Click **Deploy → New deployment**.
   - Click the gear icon next to "Select type" → **Web app**
   - Description: anything
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**, then **Authorize access** and approve the
     permissions (it needs Sheets, Drive, and external URL access for
     OpenAI — that's the OAuth consent screen you'll see, this is Google
     asking *you* to approve *your own* script, not a third party).
4. Copy the **Web app URL** it gives you (ends in `/exec`).

That's the entire backend setup. The Sheet gets its `Leads` and `Questions`
tabs (with headers) automatically the first time the script runs.

> **Redeploying after you edit Code.gs:** Apps Script Web Apps are versioned
> — editing the script doesn't update the live URL by itself. Use
> **Deploy → Manage deployments → ✏️ (edit) → Version: New version → Deploy**
> to push code changes to the same URL.

---

## 2. Connect the website to it

Open `assets/js/config.js` and paste the URL from step 1:

```js
window.APP_CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycb.../exec",
};
```

That's the only file you ever need to edit to point this site at your
backend.

---

## 3. Run it

**Just testing locally?** From this folder:
```bash
python3 -m http.server 8000
```
then open http://localhost:8000. (Any static file server works — this is
just the easiest one that's usually already installed.)

**Going live?** Upload the whole folder to any static host:
- **Netlify** — drag the folder onto https://app.netlify.com/drop, done.
- **GitHub Pages** — push this folder to a repo, enable Pages in Settings.
- **Cloudflare Pages / Vercel (static) / literally any web host** — same
  idea, it's just files.

No environment variables, no build command, no server to keep running.

---

## 4. First login

Go to `/admin-login.html` on your deployed site. Default credentials:

```
Username: admin
Password: changeme123
```

**Change the password immediately** — Admin → Settings → Admin account.

---

## 5. Add your OpenAI key

Admin → Settings → paste your key from
https://platform.openai.com/api-keys → **Save** → **Test key**.

Default model is `gpt-4o` (vision-capable). Change it in the same field if
you want a different vision-capable model later.

That's it for setup — no Google OAuth screens to configure, no client
ID/secret to paste anywhere. The Sheet and Drive folder are already yours
because the script runs as you.

---

## 6. Customize the assessment

Admin → Assessment Questions. This is a self-report intake form, not a
graded quiz — there's no "correct answer." Every active question is shown,
in a fixed order, on every test (nothing is shuffled or sampled down).

For each question you can set:
- **Answer type** — Number, Yes/No, Multiple choice, or Free text (free
  text is always optional/skippable; the others are required)
- **Options** — for Multiple choice, add/remove as many as you need
- **"Only ask this if…"** — make a question conditional on an earlier
  Yes/No or Multiple-choice answer (e.g. "Which type of aligner did you
  use?" only appears if "Used aligners before?" was answered "Yes")
- **Active** / reorder with the ▲▼ arrows, then **Save all**

The photos and these answers are analyzed together — OpenAI sees both the
images and a plain-language summary of what was reported (age, pain,
bleeding, habits, history) and is told to let them corroborate each other,
so a reported symptom can matter even when it isn't obviously visible in a
photo. Answers to habit/symptom questions (bleeding gums, pain, brushing
frequency, smoking, flossing, dental visit frequency) also feed directly
into the lead's risk score — see §8. History questions like "had a root
canal before?" are informational only and don't add risk on their own,
since that's a past, already-treated fact rather than an active concern.

---

## 7. Share links

Admin → Share Links → generate a labeled link (e.g. "Instagram bio"). It's
just `test.html?ref=yourcode` — the `ref` is recorded on every lead so you
know which channel it came from.

---

## 8. How "hot lead" scoring works

Each submission gets a 0–100 **risk score** (see `computeRiskScore` in
`Code.gs`):
- Severity of each detected category from the photos (decay/cavities and
  gum health weigh heaviest)
- +25 if the AI flags a possible root-canal-risk sign
- Points from specific self-reported symptoms/habits — bleeding gums,
  pain/sensitivity, tooth color, brushing frequency, flossing, smoking,
  and dental visit frequency each add points based on the answer given
  (see `SELF_REPORT_RISK_MAP` in `Code.gs`)
- +5 if they left contact info

`≥55` → 🔥 Hot, `28–54` → 🌤️ Warm, `<28` → ❄️ Cold. Tune the numbers directly
in `Code.gs` (`CATEGORY_WEIGHTS`, `SEVERITY_PENALTY`, `SELF_REPORT_RISK_MAP`,
`classifyTemperature`) if you want to adjust it — then redeploy (see the
note in step 1).

---

## 9. Your data, always

- **Leads** — the `Leads` tab of your Sheet. Every row is one submission.
  Use Sheets' own File → Download for CSV/Excel export any time — no
  separate export feature needed, it's already a spreadsheet.
- **Photos** — the Drive folder the script creates (linked from Admin →
  Settings).
- **Assessment questions** — the `Questions` tab.
- **Settings** (OpenAI key, admin password, brand name, share-link codes) —
  Apps Script's PropertiesService, a small persistent key/value store tied
  to the script itself. Not visible in the Sheet, not exposed to the
  browser.

Delete the Apps Script deployment or revoke its Google permissions at any
time to fully shut off access — your Sheet data stays exactly as it is.

---

## 10. File structure

```
index.html              landing page
test.html                photo upload → AI analysis → assessment → contact → submit
report.html               infographic report (reads ?id=... from the URL)
admin-login.html
admin-dashboard.html      leads table, stats, hot/warm/cold filtering
admin-lead.html            single lead detail + follow-up notes (?id=...)
admin-questions.html       assessment question editor
admin-links.html            share-link generator
admin-settings.html         OpenAI key, brand name, admin credentials, Sheet/Drive links
assets/
  css/styles.css          all styling (design tokens at the top)
  js/config.js             ← the one line you edit (your Apps Script URL)
  js/api.js                 shared fetch wrapper + image resizing + auth token helpers
  js/admin-common.js         shared admin sidebar + auth guard
apps-script/
  Code.gs                  the entire backend — paste this into Apps Script
test/                      maintainer-only: a Node/Playwright test harness
                            that mocks the backend to sanity-check pages
                            and Code.gs's pure logic. Not needed to run the
                            site; see test/logic.test.js and
                            test/browser_check.py if you want to re-verify
                            after making changes.
```

---

## 11. Important technical note (don't "fix" this)

The frontend calls the Apps Script backend with:
```js
fetch(url, {
  method: "POST",
  headers: { "Content-Type": "text/plain;charset=utf-8" },
  body: JSON.stringify({ action, payload }),
});
```
`Content-Type: text/plain` is **intentional**, not a mistake. Using
`application/json` there triggers a CORS preflight (an `OPTIONS` request)
that Apps Script Web Apps cannot answer, which breaks every single request
with a CORS error. `text/plain` counts as a browser "simple request" so no
preflight happens — and `Code.gs`'s `doPost` still parses the body as JSON
fine regardless of what Content-Type says. This is a very common trap when
extending this project — if requests start failing with CORS errors after
you change something, check you haven't changed this header.

---

## 12. Troubleshooting

- **"This site isn't connected to its backend yet"** — you haven't pasted
  your Web App URL into `assets/js/config.js` yet.
- **CORS error in the browser console** — see §11 above; also double-check
  the deployment's "Who has access" is set to **Anyone**, not "Anyone with
  Google account" or "Only myself".
- **Changes to Code.gs don't show up** — you edited the script but didn't
  push a new deployment version (see the note in step 1).
- **"OpenAI request failed"** — check the key in Admin → Settings → Test
  key; also confirm your OpenAI account has quota for the model you set.
- **Photos not showing in the admin dashboard** — the Drive folder's
  sharing needs to allow "Anyone with the link — Viewer"; the script sets
  this automatically on upload, but if you manually moved/reorganized the
  folder, permissions may not have carried over.

---

## Disclaimer

This tool produces an **AI-assisted visual screening**, not a medical
diagnosis. Both the report and admin views say so in-product — please
don't remove that language.
