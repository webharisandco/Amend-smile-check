"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import AlignmentDiagram from "@/components/AlignmentDiagram";
import { api } from "@/lib/client/api";
import { STATUSES, TEMP_META, waLink, reportLink, updateLead, copyText } from "@/lib/client/admin";

const CATS = [["alignment", "Alignment"], ["decayCavities", "Cavity check"], ["gumHealth", "Gum health"], ["enamelWear", "Enamel"], ["stainingColor", "Shade"]];
const URG = { routine: "badge-brand", soon: "badge-orange", priority: "badge-danger" };
const col = (s) => (s >= 80 ? "var(--success)" : s >= 65 ? "var(--navy)" : s >= 45 ? "var(--orange)" : "var(--danger)");

export default function LeadPage() {
  const { id } = useParams();
  const router = useRouter();
  const [lead, setLead] = useState(null);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState("");
  const [saved, setSaved] = useState("");
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [takenAt, setTakenAt] = useState("");

  useEffect(() => {
    api(`/api/admin/leads/${encodeURIComponent(id)}`)
      .then((d) => {
        setLead(d.lead);
        setNotes(d.lead.notes || "");
        setTakenAt(new Date(d.lead.timestamp).toLocaleString());
      })
      .catch((err) => setError(err.status === 404 ? "This lead may have been deleted." : err.message));
  }, [id]);

  async function setStatus(status) {
    const prev = lead.status;
    setLead({ ...lead, status });
    try {
      await updateLead(lead.leadId, { status });
    } catch (err) {
      alert(err.message);
      setLead((l) => ({ ...l, status: prev }));
    }
  }
  const markContacted = () => lead.status === "new" && setStatus("contacted");

  async function saveNotes() {
    try {
      await updateLead(lead.leadId, { notes });
      setSaved("Saved ✓");
    } catch (err) {
      setSaved("");
      alert(err.message);
      return;
    }
    setTimeout(() => setSaved(""), 2000);
  }

  async function deleteLead() {
    const ok = window.confirm(
      `Permanently delete ${lead.name || "this lead"}?\n\nThis removes their details, AI report and all photos (from Bunny Storage). The patient's report link will stop working. This cannot be undone.`
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await api(`/api/admin/leads/${encodeURIComponent(lead.leadId)}`, { method: "DELETE", retries: 0 });
      router.push("/admin");
    } catch (err) {
      alert(err.message);
      setDeleting(false);
    }
  }

  if (error) {
    return (
      <>
        <Link href="/admin" className="text-sm muted" style={{ textDecoration: "none" }}>← Dashboard</Link>
        <div className="card center mt-16" style={{ padding: 50 }}>
          <h2 style={{ margin: "0 0 6px" }}>Lead not available</h2>
          <p className="muted">{error}</p>
          <Link className="btn btn-primary mt-16" href="/admin">Back to dashboard</Link>
        </div>
      </>
    );
  }
  if (!lead) return <p className="muted">Loading lead…</p>;

  const a = lead.analysis || {};
  const cats = a.categories || {};
  const d = a.alignmentDetail;
  const t = TEMP_META[lead.temperature] || TEMP_META.cold;
  const aligner = d && d.alignerCandidate;
  const report = reportLink(lead);

  return (
    <div className="lead-page">
      <Link href="/admin" className="text-sm muted" style={{ textDecoration: "none" }}>← Dashboard</Link>

      <div className="flex justify-between items-start mt-16" style={{ flexWrap: "wrap", gap: 14, marginBottom: 18 }}>
        <div>
          <div className="flex items-center gap-8" style={{ flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 28, margin: 0 }}>{lead.name || "Anonymous"}</h1>
            <span className={"badge " + t.cls}>{t.icon} {t.label} · {lead.riskScore}</span>
            {aligner && <span className="badge badge-orange">Aligner candidate</span>}
          </div>
          <p className="text-sm muted" style={{ margin: "4px 0 0" }}>Took the test {takenAt} · via {lead.refSource || "direct"}</p>
        </div>
        <div className="actions">
          {lead.phone && (
            <>
              <a className="btn btn-whatsapp" href={waLink(lead)} target="_blank" rel="noopener" onClick={markContacted}>💬 WhatsApp + report</a>
              <a className="btn btn-outline" href={`tel:${lead.phone}`} onClick={markContacted}>📞 Call</a>
            </>
          )}
          {lead.email && <a className="btn btn-outline" href={`mailto:${lead.email}`} onClick={markContacted}>✉️ Email</a>}
          <a className="btn btn-outline" href={report} target="_blank" rel="noopener">📄 Patient report</a>
          <button className="btn btn-ghost" onClick={async () => {
            if (await copyText(report)) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
          }}>{copied ? "✓ Copied" : "Copy report link"}</button>
        </div>
      </div>

      <div className="layout">
        <div className="col">
          {a.staffNote && (
            <div className="card" style={{ background: "var(--orange-soft)", borderColor: "#fde2c0" }}>
              <div className="eyebrow">Consultation angle · internal</div>
              <p style={{ margin: "6px 0 0", fontSize: 15, lineHeight: 1.6 }}>{a.staffNote}</p>
            </div>
          )}

          <div className="card">
            <h2 className="h">AI summary (as shown to patient)</h2>
            <p style={{ margin: 0, lineHeight: 1.65 }}>{a.patientSummary || cats.alignment?.summary || "—"}</p>
          </div>

          <div className="card">
            <h2 className="h">Scores</h2>
            {CATS.map(([k, lbl]) => {
              const c = cats[k] || { score: 0, summary: "" };
              return (
                <div className="score-row" key={k}>
                  <div className="score-row-head">
                    <span style={{ fontWeight: 600 }}>{lbl}</span>
                    <b style={{ color: col(c.score) }}>{c.score}</b>
                  </div>
                  <div className="score-bar-track"><div className="score-bar-fill" style={{ width: `${c.score}%`, background: col(c.score) }} /></div>
                  <div className="score-summary">{c.summary}</div>
                </div>
              );
            })}
          </div>

          <div className="grid-2">
            <div className="card">
              <h2 className="h">Attention areas</h2>
              {(a.attentionAreas || []).length ? (
                a.attentionAreas.map((x, i) => (
                  <div className="att" key={i}>
                    <div className="flex justify-between gap-8"><b className="text-sm">{x.title}</b><span className={"badge " + (URG[x.urgency] || "badge-brand")}>{x.urgency}</span></div>
                    {x.location && <div className="text-xs muted">📍 {x.location}</div>}
                    <div className="text-sm muted">{x.detail}</div>
                  </div>
                ))
              ) : (a.detectedIssues || []).length ? (
                a.detectedIssues.map((iss, i) => <div className="att text-sm" key={i}>{iss}</div>)
              ) : (
                <p className="text-sm muted">None flagged.</p>
              )}
            </div>
            <div className="card">
              <h2 className="h">Treatment opportunities</h2>
              {(a.recommendedTreatments || []).length ? (
                a.recommendedTreatments.map((r, i) => (
                  <div className="att" key={i}>
                    <div className="flex justify-between gap-8"><b className="text-sm">{r.service}</b><span className={"badge " + (r.fit === "strong" ? "badge-orange" : "badge-neutral")}>{r.fit}</span></div>
                    <div className="text-sm muted">{r.reason}</div>
                  </div>
                ))
              ) : (
                <p className="text-sm muted">—</p>
              )}
            </div>
          </div>

          {d && (
            <div className="card">
              <h2 className="h">Alignment map</h2>
              <AlignmentDiagram detail={d} />
              {d.biteNote && <p className="text-xs muted center" style={{ marginTop: 10 }}>{d.biteNote}</p>}
              {aligner && (
                <p className="text-sm" style={{ background: "var(--orange-soft)", borderRadius: 12, padding: "10px 12px", margin: "12px 0 0" }}>
                  <b>Aligner fit:</b> {d.alignerNote}
                </p>
              )}
            </div>
          )}
          {a.rootCanalRiskFlag && (
            <div className="card" style={{ background: "var(--danger-bg)", borderColor: "#f7c9c4" }}>
              <b>Root canal risk flagged</b>
              <p className="text-sm" style={{ margin: "4px 0 0" }}>{a.rootCanalRiskNote}</p>
            </div>
          )}
          {a.photoQualityWarning && (
            <div className="card" style={{ background: "var(--warning-bg)", borderColor: "#fbe0b5" }}>
              <b>Photo quality note</b>
              <p className="text-sm" style={{ margin: "4px 0 0" }}>{a.photoQualityWarning}</p>
            </div>
          )}
        </div>

        <div className="col">
          <div className="card">
            <h2 className="h">Stage</h2>
            <div className="stage-bar">
              {STATUSES.map((s) => (
                <button key={s.key} className={"stage-btn" + (s.key === lead.status ? " on" : "")} onClick={() => setStatus(s.key)}>{s.label}</button>
              ))}
            </div>
            <label className="field-label mt-16" htmlFor="notes">Notes</label>
            <textarea id="notes" rows={4} placeholder="Call outcome, preferred branch, follow-up date…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <button className="btn btn-primary btn-sm mt-8" onClick={saveNotes}>Save notes</button>{" "}
            <span className="text-xs" style={{ color: "var(--success)" }}>{saved}</span>
          </div>

          <div className="card" style={{ textAlign: "center" }}>
            <div className="gauge-value" style={{ color: col(lead.oralHealthScore) }}>{lead.oralHealthScore}</div>
            <div className="gauge-max">Oral health score / 100</div>
          </div>

          <div className="card">
            <h2 className="h">Photos</h2>
            {lead.photoUrls.length ? (
              <div className="photos">
                {lead.photoUrls.map((u, i) => (
                  <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                    <img src={u} alt={`Photo ${i + 1}`} referrerPolicy="no-referrer" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="text-sm muted">No photos stored for this lead.</p>
            )}
          </div>

          <div className="card">
            <h2 className="h">Contact</h2>
            <div className="kv"><span>Phone</span><span>{lead.phone || "—"}</span></div>
            <div className="kv"><span>Email</span><span>{lead.email || "—"}</span></div>
            <div className="kv"><span>Lead ID</span><span>{lead.leadId}</span></div>
          </div>

          <div className="card">
            <h2 className="h">Self-reported answers</h2>
            {(lead.assessmentAnswers || []).length ? (
              lead.assessmentAnswers.map((x, i) => (
                <div className="kv" key={i}><span>{x.text || x.questionId}</span><span>{x.value}</span></div>
              ))
            ) : (
              <p className="text-sm muted">None.</p>
            )}
          </div>

          <div className="card">
            <h2 className="h">Danger zone</h2>
            <p className="text-sm muted" style={{ margin: "0 0 12px" }}>Removes this lead and its photos for good — e.g. if the patient asks for their data to be deleted.</p>
            <button className="btn btn-danger-outline btn-sm" onClick={deleteLead} disabled={deleting}>
              {deleting ? "Deleting…" : "🗑️ Delete lead & photos"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
