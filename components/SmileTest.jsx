"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, resizeImageFile, newRequestId } from "@/lib/client/api";
import { siteConfig } from "@/lib/config";

const PHOTO_SLOTS = [
  { label: "Front smile", hint: "Smile naturally, facing the camera" },
  { label: "Upper teeth", hint: "Lips pulled back, upper teeth in focus" },
  { label: "Lower teeth", hint: "Lips pulled back, lower teeth in focus" },
];
const WAIT_LINES = [
  "Looking closely at your photos…",
  "Checking alignment tooth by tooth…",
  "Reviewing gum colour and enamel…",
  "Reading your answers…",
  "Writing your personal summary…",
  "Almost ready…",
];
const STEP_HINT = { photos: "Step 1 of 3", quiz: "Step 2 of 3", contact: "Step 3 of 3", submitting: "Finishing up" };

const isVisible = (q, answers) => {
  if (!q.dependsOnId) return true;
  const parent = answers.find((a) => a.questionId === q.dependsOnId);
  return Boolean(parent && parent.value === q.dependsOnValue);
};
const nextVisibleIndex = (questions, from, answers) => {
  for (let i = from; i < questions.length; i++) if (isVisible(questions[i], answers)) return i;
  return -1;
};

export default function SmileTest() {
  const router = useRouter();
  const [step, setStep] = useState("photos");

  // Step 1 — photos (prepared JPEG data URLs)
  const [photos, setPhotos] = useState([null, null, null]);
  const [preparing, setPreparing] = useState([false, false, false]);
  const [photoError, setPhotoError] = useState("");
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const fileInputRef = useRef(null);
  const pickIndexRef = useRef(0);

  // Step 2 — questions
  const [questions, setQuestions] = useState([]);
  const questionsPromiseRef = useRef(null);
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [currentValue, setCurrentValue] = useState("");

  // Background analysis
  const analysisRef = useRef({ promise: null, result: null, error: null });
  const [bg, setBg] = useState({ kind: "running", text: "Our AI is analysing your photos…" });

  // Step 3 — contact + submit
  const [contact, setContact] = useState({ name: "", phone: "", email: "" });
  const [contactError, setContactError] = useState("");
  const [wait, setWait] = useState({ pct: 0, line: WAIT_LINES[0], retry: "" });
  const savingRef = useRef(false);
  const refSourceRef = useRef("direct");

  // Load questions right away (with retries) so step 2 is instant.
  useEffect(() => {
    refSourceRef.current = new URLSearchParams(window.location.search).get("ref") || "direct";
    questionsPromiseRef.current = loadQuestions();
    questionsPromiseRef.current.catch(() => {});
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [step]);

  // Animated progress while the report is being created.
  useEffect(() => {
    if (step !== "submitting") return;
    const t0 = Date.now();
    let line = 0;
    setWait({ pct: 0, line: WAIT_LINES[0], retry: "" });
    const id = setInterval(() => {
      const secs = (Date.now() - t0) / 1000;
      if (Math.floor(secs / 5) > line && line < WAIT_LINES.length - 1) line++;
      setWait((w) => ({
        ...w,
        pct: Math.max(w.pct, Math.min(95, 100 * (1 - Math.exp(-secs / 18)))),
        line: savingRef.current ? "Saving your report…" : WAIT_LINES[line],
      }));
    }, 500);
    return () => clearInterval(id);
  }, [step]);

  function loadQuestions() {
    return api("/api/questions", { retries: 3 }).then((d) => {
      const list = d.questions || [];
      setQuestions(list);
      return list;
    });
  }

  // ── Step 1: photos ───────────────────────────────────────────────────
  function pickPhoto(i) {
    pickIndexRef.current = i;
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  async function onFileChosen(e) {
    const file = e.target.files && e.target.files[0];
    const i = pickIndexRef.current;
    if (!file) return;
    setPhotoError("");
    setPreparing((p) => p.map((v, j) => (j === i ? true : v)));
    try {
      const dataUrl = await resizeImageFile(file);
      setPhotos((p) => p.map((v, j) => (j === i ? dataUrl : v)));
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setPreparing((p) => p.map((v, j) => (j === i ? false : v)));
    }
  }

  async function onPhotosNext() {
    setLoadingQuestions(true);
    setPhotoError("");
    try {
      const list = await questionsPromiseRef.current.catch(() => (questionsPromiseRef.current = loadQuestions()));
      startQuiz(list);
    } catch (err) {
      setPhotoError(err.message);
    } finally {
      setLoadingQuestions(false);
    }
  }

  // ── Step 2: assessment ───────────────────────────────────────────────
  function startQuiz(list) {
    setAnswers([]);
    const first = nextVisibleIndex(list, 0, []);
    if (first === -1) return finishQuiz([]);
    setQIndex(first);
    setCurrentValue("");
    setStep("quiz");
  }

  function advance(skip) {
    const q = questions[qIndex];
    const value = skip ? "" : String(currentValue || "").trim();
    const next = value ? [...answers, { questionId: q.id, value }] : answers;
    setAnswers(next);
    const n = nextVisibleIndex(questions, qIndex + 1, next);
    if (n === -1) finishQuiz(next);
    else {
      setQIndex(n);
      setCurrentValue("");
    }
  }

  // ── Background analysis (photos + answers together) ──────────────────
  function startAnalysis(ans) {
    const st = analysisRef.current;
    st.result = null;
    st.error = null;
    setBg({ kind: "running", text: "Our AI is analysing your photos…" });
    st.promise = api("/api/analyze", {
      method: "POST",
      body: { photos, answers: ans, requestId: newRequestId() },
      timeoutMs: 150000,
      retries: 3,
      onRetry: () => setBg({ kind: "running", text: "Slow connection — still working on it…" }),
    })
      .then((d) => {
        st.result = d;
        setBg({ kind: "done", text: "✓ Your analysis is ready" });
        return d;
      })
      .catch((err) => {
        st.error = err;
        setBg({ kind: "fail", text: err.message });
        throw err;
      });
    st.promise.catch(() => {}); // handled in the UI
  }

  function finishQuiz(ans) {
    startAnalysis(ans);
    setStep("contact");
  }

  // ── Step 3: submit ───────────────────────────────────────────────────
  async function submit() {
    setContactError("");
    savingRef.current = false;
    setStep("submitting");
    try {
      const st = analysisRef.current;
      if (!st.result) {
        if (st.error) startAnalysis(answers); // pressed submit after a failure → try again
        await analysisRef.current.promise;
      }
      savingRef.current = true;
      const resp = await api("/api/submit", {
        method: "POST",
        body: {
          analysisToken: analysisRef.current.result.analysisToken,
          name: contact.name.trim(),
          phone: contact.phone.trim(),
          email: contact.email.trim(),
          refSource: refSourceRef.current,
          answers,
          photos,
        },
        timeoutMs: 90000,
        retries: 3,
        onRetry: () => setWait((w) => ({ ...w, retry: "Slow connection — retrying automatically…" })),
      });
      setWait((w) => ({ ...w, pct: 100 }));
      router.push(`/report/${encodeURIComponent(resp.leadId)}`);
    } catch (err) {
      setStep("contact");
      setContactError((err.message || "Something went wrong.") + " Tap the button to try again — your answers are saved.");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────
  const q = questions[qIndex];
  const total = questions.filter((x) => !x.dependsOnId).length || questions.length || 1;
  const pct = Math.min(100, Math.round((answers.length / total) * 100));
  const isChoice = q && (q.type === "single_choice" || q.type === "yes_no");
  const isLast = q ? nextVisibleIndex(questions, qIndex + 1, answers) === -1 : false;
  const nextDisabled = q && q.type !== "text" && !String(currentValue || "").trim();

  return (
    <div className="page test">
      <header className="topbar">
        <a href={siteConfig.websiteUrl} target="_blank" rel="noopener">
          <img className="logo" src="/img/amend-logo.png" alt={siteConfig.clinicName} />
        </a>
        <div className="spacer" />
        <span className="text-xs muted">{STEP_HINT[step]}</span>
      </header>

      <input ref={fileInputRef} type="file" accept="image/*,.heic,.heif" hidden onChange={onFileChosen} />

      <main className="container">
        {step === "photos" && (
          <section className="step">
            <div className="center">
              <span className="eyebrow">Step 1 · Photos</span>
            </div>
            <h1 className="step-title">Add 3 photos of your teeth</h1>
            <p className="step-sub">
              Take new photos or choose from your gallery. Good light and a close-up angle give the most accurate results.
            </p>
            <div className="photo-grid">
              {PHOTO_SLOTS.map((slot, i) => (
                <div key={slot.label}>
                  {photos[i] ? (
                    <div className="photo-slot filled">
                      <img src={photos[i]} alt={slot.label} />
                      <button
                        className="remove-btn"
                        aria-label="Remove photo"
                        onClick={() => setPhotos((p) => p.map((v, j) => (j === i ? null : v)))}
                      >
                        ✕
                      </button>
                    </div>
                  ) : preparing[i] ? (
                    <div className="photo-slot">
                      <div className="slot-status">
                        <div className="mini-spinner spin" />
                        Preparing photo…
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="photo-slot" onClick={() => pickPhoto(i)}>
                      <div className="photo-slot-icon">📷</div>
                      <span className="text-xs" style={{ fontWeight: 600 }}>
                        Take or choose photo
                      </span>
                    </button>
                  )}
                  <div className="photo-label">{slot.label}</div>
                  <div className="photo-hint">{slot.hint}</div>
                </div>
              ))}
            </div>
            <div className="center" style={{ marginTop: 28 }}>
              <button
                className="btn btn-orange btn-lg"
                disabled={!photos.every(Boolean) || loadingQuestions}
                onClick={onPhotosNext}
              >
                {loadingQuestions ? "Loading questions…" : "Continue →"}
              </button>
            </div>
            {photoError && <p className="error-box">{photoError}</p>}
          </section>
        )}

        {step === "quiz" && q && (
          <section className="step">
            <div className="center">
              <span className="eyebrow">Step 2 · A few quick questions</span>
            </div>
            <div style={{ maxWidth: 520, margin: "18px auto 0" }} key={q.id}>
              <div className="flex justify-between text-xs muted mb-8">
                <span>Question {answers.length + 1}</span>
                <span>{pct}%</span>
              </div>
              <div className="quiz-progress-track">
                <div className="quiz-progress-fill" style={{ width: pct + "%" }} />
              </div>
              <h3 style={{ fontSize: 19, fontWeight: 700, margin: "24px 0 18px" }}>{q.text}</h3>

              {isChoice &&
                (q.type === "yes_no" ? ["Yes", "No"] : q.options).map((opt) => (
                  <button
                    key={opt}
                    className={"quiz-option" + (currentValue === opt ? " selected" : "")}
                    onClick={() => setCurrentValue(opt)}
                  >
                    {opt}
                  </button>
                ))}
              {q.type === "number" && (
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="120"
                  placeholder="e.g. 29"
                  autoFocus
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !nextDisabled && advance(false)}
                />
              )}
              {q.type === "text" && (
                <textarea
                  rows={2}
                  placeholder="Type your answer (optional)"
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                />
              )}

              <div className="center" style={{ marginTop: 20 }}>
                <button className="btn btn-primary btn-lg" disabled={nextDisabled} onClick={() => advance(false)}>
                  {isLast ? "Finish" : "Next"}
                </button>
                {q.type === "text" && (
                  <div>
                    <button className="btn btn-ghost btn-sm mt-8" onClick={() => advance(true)}>
                      Skip this question
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {step === "contact" && (
          <section className="step">
            <div style={{ maxWidth: 380, margin: "0 auto" }}>
              <div className="center">
                <span className="eyebrow">Step 3 · Your details</span>
              </div>
              <h1 className="step-title">Almost there</h1>
              <p className="step-sub">Enter your details to unlock your personal Smile Report.</p>

              <div className={"bg-status" + (bg.kind === "done" ? " done" : bg.kind === "fail" ? " fail" : "")}>
                {bg.kind === "running" && <div className="mini-spinner spin" />}
                <span style={{ flex: 1 }}>{bg.text}</span>
                {bg.kind === "fail" && (
                  <button className="btn btn-sm btn-outline" onClick={() => startAnalysis(answers)}>
                    Try again
                  </button>
                )}
              </div>

              <div className="field">
                <label className="field-label" htmlFor="nameInput">Full name</label>
                <input id="nameInput" type="text" placeholder="Your name" autoComplete="name" value={contact.name}
                  onChange={(e) => setContact({ ...contact, name: e.target.value })} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="phoneInput">Phone (WhatsApp)</label>
                <input id="phoneInput" type="tel" placeholder="+91 98765 43210" autoComplete="tel" value={contact.phone}
                  onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
              </div>
              <div className="field">
                <label className="field-label" htmlFor="emailInput">Email (optional)</label>
                <input id="emailInput" type="email" placeholder="you@email.com" autoComplete="email" value={contact.email}
                  onChange={(e) => setContact({ ...contact, email: e.target.value })} />
              </div>
              {contactError && (
                <p className="error-box" style={{ textAlign: "left" }}>
                  {contactError}
                </p>
              )}
              <button
                className="btn btn-orange btn-lg btn-block mt-8"
                disabled={!contact.name.trim() || !contact.phone.trim()}
                onClick={submit}
              >
                See my Smile Report →
              </button>
              <p className="text-xs muted center mt-8">
                By continuing you agree to be contacted by {siteConfig.clinicName} about your results and free
                consultation. Your report is AI-generated and not a medical diagnosis.
              </p>
            </div>
          </section>
        )}

        {step === "submitting" && (
          <section className="step">
            <div className="center" style={{ paddingTop: 50 }}>
              <img src="/img/amend-mark.png" alt="" className="spin" style={{ width: 72, margin: "0 auto", animationDuration: "3s" }} />
              <h1 className="step-title" style={{ marginTop: 22 }}>
                Creating your Smile Report
              </h1>
              <p className="muted" style={{ margin: 0 }}>
                {wait.line}
              </p>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: wait.pct + "%" }} />
              </div>
              <p className="text-xs muted" style={{ minHeight: 16 }}>
                {wait.retry}
              </p>
              <div className="keep-open">📱 Please keep this screen open — usually 20–40 seconds</div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
