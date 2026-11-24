"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";

const TYPE_LABELS = { number: "Number", text: "Free text", yes_no: "Yes / No", single_choice: "Multiple choice" };

function blankQuestion(order) {
  return {
    id: "q-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    text: "",
    type: "single_choice",
    options: ["", ""],
    category: "custom",
    dependsOnId: "",
    dependsOnValue: "",
    active: true,
    order,
  };
}

const answerValues = (q) => (!q ? [] : q.type === "yes_no" ? ["Yes", "No"] : q.options.filter((o) => o.trim()));

export default function QuestionsPage() {
  const [questions, setQuestions] = useState(null);
  const [error, setError] = useState("");
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api("/api/admin/questions")
      .then((d) => setQuestions(d.questions || []))
      .catch((err) => setError(err.message));
  }, []);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function change(fn) {
    setQuestions((qs) => {
      const copy = qs.map((q) => ({ ...q, options: [...q.options] }));
      fn(copy);
      return copy;
    });
    setDirty(true);
    setError("");
  }
  const patch = (qi, p) => change((qs) => Object.assign(qs[qi], p));

  function move(qi, dir) {
    change((qs) => {
      const j = qi + dir;
      [qs[qi], qs[j]] = [qs[j], qs[qi]];
    });
  }

  function remove(qi) {
    change((qs) => {
      const [gone] = qs.splice(qi, 1);
      qs.forEach((o) => {
        if (o.dependsOnId === gone.id) {
          o.dependsOnId = "";
          o.dependsOnValue = "";
        }
      });
    });
  }

  async function save() {
    setSaveState("saving");
    setError("");
    try {
      const payload = questions.map((q, i) => ({
        ...q,
        order: i + 1,
        options: q.type === "single_choice" ? q.options.map((o) => o.trim()).filter(Boolean) : [],
      }));
      const d = await api("/api/admin/questions", { method: "PUT", body: { questions: payload }, retries: 0 });
      setQuestions(d.questions);
      setDirty(false);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 1500);
    } catch (err) {
      setError(err.message || "Could not save.");
      setSaveState("idle");
    }
  }

  const activeCount = (questions || []).filter((q) => q.active).length;

  return (
    <div className="questions-page" style={{ maxWidth: 820 }}>
      <div className="flex justify-between items-center mb-16" style={{ flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Assessment Questions</h1>
          <p className="text-sm muted" style={{ margin: "4px 0 0" }}>
            {questions
              ? `${activeCount} active question(s), shown in order on every test — not shuffled or graded.`
              : "This is a self-report intake form, not a graded quiz."}
          </p>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-outline btn-sm" disabled={!questions}
            onClick={() => change((qs) => qs.push(blankQuestion(qs.length + 1)))}>➕ Add question</button>
          <button className="btn btn-primary btn-sm" disabled={!questions || saveState === "saving"} onClick={save}>
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved!" : dirty ? "💾 Save all *" : "💾 Save all"}
          </button>
        </div>
      </div>

      {error && <div className="banner banner-error">{error}</div>}
      {!questions && !error && <p className="muted">Loading…</p>}
      {questions && !questions.length && <p className="center muted" style={{ padding: "40px 0" }}>No questions yet — add one to get started.</p>}

      {questions?.map((q, qi) => {
        const deps = questions.slice(0, qi).filter((x) => x.type === "yes_no" || x.type === "single_choice");
        const depQ = questions.find((x) => x.id === q.dependsOnId);
        return (
          <div className="card q-card" key={q.id}>
            <div className="q-row">
              <div className="q-order-btns">
                <button disabled={qi === 0} title="Move up" onClick={() => move(qi, -1)}>▲</button>
                <button disabled={qi === questions.length - 1} title="Move down" onClick={() => move(qi, 1)}>▼</button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center gap-8 mb-8" style={{ flexWrap: "wrap" }}>
                  <span className="text-xs muted" style={{ width: 20 }}>#{qi + 1}</span>
                  <input type="text" value={q.text} placeholder="Question text" style={{ flex: 1, minWidth: 180 }}
                    onChange={(e) => patch(qi, { text: e.target.value })} />
                  <span className="type-badge">{TYPE_LABELS[q.type] || q.type}</span>
                  <label className="text-xs flex items-center gap-8" style={{ whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={q.active} onChange={(e) => patch(qi, { active: e.target.checked })} /> Active
                  </label>
                  <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => remove(qi)}>🗑️</button>
                </div>

                <div className="meta-grid">
                  <div>
                    <label className="field-label text-xs">Answer type</label>
                    <select value={q.type} onChange={(e) => {
                      const type = e.target.value;
                      patch(qi, { type, options: type === "single_choice" && !q.options.length ? ["", ""] : q.options });
                    }}>
                      <option value="single_choice">Multiple choice</option>
                      <option value="yes_no">Yes / No</option>
                      <option value="number">Number</option>
                      <option value="text">Free text (optional)</option>
                    </select>
                  </div>
                  <div>
                    <label className="field-label text-xs">Only ask this if…</label>
                    <div className="flex gap-8">
                      <select style={{ flex: 1 }} value={q.dependsOnId} onChange={(e) => {
                        const dq = questions.find((x) => x.id === e.target.value);
                        patch(qi, { dependsOnId: e.target.value, dependsOnValue: answerValues(dq)[0] || "" });
                      }}>
                        <option value="">Always ask</option>
                        {deps.map((dq) => <option key={dq.id} value={dq.id}>{dq.text || dq.id}</option>)}
                      </select>
                      <select style={{ flex: 1 }} disabled={!q.dependsOnId} value={q.dependsOnValue}
                        onChange={(e) => patch(qi, { dependsOnValue: e.target.value })}>
                        {depQ ? answerValues(depQ).map((v) => <option key={v} value={v}>{v}</option>) : <option value="">—</option>}
                      </select>
                    </div>
                  </div>
                </div>

                {q.type === "single_choice" && (
                  <div className="mt-8">
                    <label className="field-label text-xs">Options</label>
                    {q.options.map((opt, oi) => (
                      <div className="opt-row" key={oi}>
                        <input type="text" value={opt} placeholder={`Option ${oi + 1}`}
                          onChange={(e) => change((qs) => (qs[qi].options[oi] = e.target.value))} />
                        <button className="opt-remove" title="Remove option" onClick={() => change((qs) => qs[qi].options.splice(oi, 1))}>✕</button>
                      </div>
                    ))}
                    <button className="btn btn-ghost btn-sm" onClick={() => change((qs) => qs[qi].options.push(""))}>➕ Add option</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
