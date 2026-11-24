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

---

## Disclaimer

This tool produces an **AI-assisted visual screening**, not a medical
diagnosis. Both the report and admin views say so in-product — please
don't remove that language.
