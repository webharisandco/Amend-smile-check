"use client";

import { useEffect, useState } from "react";
import AlignmentDiagram from "./AlignmentDiagram";
import { siteConfig, displayDomain } from "@/lib/config";

const CATS = [
  { key: "alignment", label: "Alignment", short: "Alignment", icon: "🦷" },
  { key: "decayCavities", label: "Cavity check", short: "Cavities", icon: "🔍" },
  { key: "gumHealth", label: "Gum health", short: "Gums", icon: "🌸" },
  { key: "enamelWear", label: "Enamel strength", short: "Enamel", icon: "🛡️" },
  { key: "stainingColor", label: "Shade & brightness", short: "Shade", icon: "✨" },
];
const TREAT_ICON = {
  "Invisible Aligners": "😁",
  "Microscopic Root Canal Treatment": "🔬",
  "Professional Cleaning & Scaling": "🪥",
  "Teeth Whitening": "✨",
  "Tooth-coloured Fillings": "🦷",
  "Crowns & Veneers (Smile Correction)": "💎",
  "Dental Implants": "🔩",
  "Gum Care Treatment": "🌸",
  "Routine Check-up": "🩺",
};
const URGENCY = {
  routine: { label: "Routine", bg: "var(--navy-soft)", fg: "var(--navy)", icon: "•" },
  soon: { label: "Check soon", bg: "var(--orange-soft)", fg: "#b8650a", icon: "!" },
  priority: { label: "Priority", bg: "#fdecea", fg: "#c0392b", icon: "!" },
};

const color = (s) => (s >= 80 ? "#1f9d55" : s >= 65 ? "#1e3a6e" : s >= 45 ? "#f39322" : "#e0664f");
const label = (s) =>
  s >= 80 ? "Excellent" : s >= 65 ? "Healthy, with a few notes" : s >= 45 ? "Worth a check-up" : "Let's take a closer look";

function Ring({ size, stroke, score, animate }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const final = c * (1 - score / 100);
  const [offset, setOffset] = useState(animate ? c : final);
  useEffect(() => {
    if (!animate) return;
    const t = setTimeout(() => setOffset(final), 80);
    return () => clearTimeout(t);
  }, [animate, final]);
  return (
    <svg width={size} height={size}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#ececf0" strokeWidth={stroke} fill="none" />
      <circle className="prog" cx={size / 2} cy={size / 2} r={r} stroke={color(score)} strokeWidth={stroke} fill="none"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset} />
    </svg>
  );
}

// Dependency-free SVG radar: your scores vs a healthy-smile reference ring.
function Radar({ items }) {
  const W = 520, H = 390, cx = W / 2, cy = H / 2 + 6, R = 130, n = items.length;
  const pt = (i, v) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    return [cx + (Math.cos(ang) * R * v) / 100, cy + (Math.sin(ang) * R * v) / 100];
  };
  const poly = (vals) => vals.map((v, i) => pt(i, v).join(",")).join(" ");
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%">
        {[25, 50, 75, 100].map((lv) => (
          <polygon key={lv} points={poly(items.map(() => lv))} fill="none" stroke="#ececf0" strokeWidth={1} />
        ))}
        {items.map((_, i) => {
          const [x, y] = pt(i, 100);
          return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#ececf0" />;
        })}
        <polygon points={poly(items.map(() => 85))} fill="none" stroke="#c7c7cc" strokeWidth={1.5} strokeDasharray="5 5" />
        <polygon points={poly(items.map((it) => it.value))} fill="rgba(30,58,110,.16)" stroke="#1e3a6e" strokeWidth={2.5} strokeLinejoin="round" />
        {items.map((it, i) => {
          const [x, y] = pt(i, it.value);
          const [lx, ly] = pt(i, 122);
          const anchor = Math.abs(lx - cx) < 10 ? "middle" : lx > cx ? "start" : "end";
          return (
            <g key={it.label}>
              <circle cx={x} cy={y} r={5} fill="#f39322" stroke="#fff" strokeWidth={2} />
              <text x={lx} y={ly} textAnchor={anchor} dominantBaseline="middle" fontSize={12.5} fontWeight={600} fill="#3a3a3c">
                {it.label}
              </text>
              <text x={lx} y={ly + 15} textAnchor={anchor} dominantBaseline="middle" fontSize={11.5} fill={color(it.value)} fontWeight={700}>
                {it.value}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="flex gap-16 text-xs muted" style={{ justifyContent: "center", marginTop: 6 }}>
        <span>
          <span style={{ display: "inline-block", width: 18, height: 3, background: "#1e3a6e", verticalAlign: "middle", borderRadius: 2 }} /> You
        </span>
        <span>
          <span style={{ display: "inline-block", width: 18, borderTop: "2px dashed #c7c7cc", verticalAlign: "middle" }} /> Healthy smile
        </span>
      </div>
    </>
  );
}

// Fallbacks so leads analysed before the richer AI fields existed still render.
function withFallbacks(a) {
  const cats = a.categories || {};
  const out = { ...a };
  if (!out.patientSummary) {
    out.patientSummary = CATS.map((m) => cats[m.key]?.summary).filter(Boolean).slice(0, 3).join(" ");
  }
  if (!out.strengths) out.strengths = CATS.filter((m) => cats[m.key]?.score >= 75).map((m) => `${m.label} looks healthy`);
  if (!out.attentionAreas) out.attentionAreas = (a.detectedIssues || []).map((t) => ({ title: t, location: "", detail: "", urgency: "routine" }));
  if (!out.recommendedTreatments) {
    out.recommendedTreatments = [{ service: "Routine Check-up", reason: "A quick in-person check confirms these AI findings.", fit: "strong" }];
  }
  if (!out.habitInsights) out.habitInsights = [];
  return out;
}

const Ext = ({ href, className, children }) => (
  <a className={className} href={href} target="_blank" rel="noopener">
    {children}
  </a>
);

export default function ReportView({ lead }) {
  const BOOK = siteConfig.bookingUrl;
  const SITE = siteConfig.websiteUrl;
  const a = withFallbacks(lead.analysis || {});
  const cats = a.categories || {};
  const score = lead.oralHealthScore || 0;
  const first = (lead.name || "").trim().split(" ")[0];
  const detail = a.alignmentDetail;
  const attention = a.attentionAreas || [];
  const photos = lead.photoUrls || [];
  const [date, setDate] = useState("");
  const [showSticky, setShowSticky] = useState(false);

  useEffect(() => {
    // Formatted in the browser so it uses the patient's own locale.
    setDate(new Date(lead.timestamp).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }));
    const onScroll = () => setShowSticky(window.scrollY > 500);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [lead.timestamp]);

  return (
    <div className="report">
      <header className="topbar">
        <Ext href={SITE}>
          <img className="logo" src="/img/amend-logo.png" alt={siteConfig.clinicName} />
        </Ext>
        <div className="spacer" />
        <Ext href={SITE} className="btn btn-ghost btn-sm hide-sm">Visit website</Ext>
        <Ext href={BOOK} className="btn btn-orange btn-sm">Book free consultation</Ext>
      </header>

      <main className="wrap">
        <section className="card hero fade-up">
          <span className="ai-tag">✦ AI Smile Report</span>
          <h1>{first ? `${first}, here's your smile snapshot` : "Here's your smile snapshot"}</h1>
          <p className="muted text-sm" style={{ margin: 0 }}>
            {date}
            {date ? " · " : ""}
            {siteConfig.clinicName}
          </p>
          <div className="ring-wrap">
            <Ring size={210} stroke={16} score={score} animate />
            <div className="ring-center">
              <div className="num" style={{ color: color(score) }}>{score}</div>
              <div className="of">Oral Health Score</div>
            </div>
          </div>
          <span className="gauge-label" style={{ background: color(score) + "1a", color: color(score) }}>{label(score)}</span>
          <div className="chips">
            <div className="chip"><b style={{ color: "var(--success)" }}>{(a.strengths || []).length}</b><span>Strengths</span></div>
            <div className="chip"><b style={{ color: "var(--orange)" }}>{attention.length}</b><span>Areas to review</span></div>
            <div className="chip">
              <b style={{ color: "var(--navy)" }}>{detail ? (detail.alignerCandidate ? "Likely" : "Not needed") : "—"}</b>
              <span>Aligner fit</span>
            </div>
          </div>
          {a.photoQualityWarning && (
            <p className="text-xs" style={{ color: "var(--warning)", background: "var(--warning-bg)", borderRadius: 10, padding: "8px 12px", margin: "18px auto 0", display: "inline-block" }}>
              📷 {a.photoQualityWarning}
            </p>
          )}
        </section>

        <section className="section card fade-up">
          <div className="summary-head">
            <div className="spark">✦</div>
            <div>
              <h2 className="section-title" style={{ fontSize: 18 }}>Your AI summary</h2>
              <span className="text-xs muted">Based on your photos and answers</span>
            </div>
          </div>
          <p className="summary">{a.patientSummary}</p>
        </section>

        <section className="section card cta-inline fade-up">
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Get these findings confirmed — free</div>
            <div className="text-sm muted">A quick consultation with our dentists turns this snapshot into a clear plan.</div>
          </div>
          <Ext href={BOOK} className="btn btn-orange">Book free consultation</Ext>
        </section>

        {photos.length > 0 && (
          <section className="section card fade-up">
            <h2 className="section-title">Your photos</h2>
            <p className="section-sub">What our AI analysed. Tap to view full size.</p>
            <div className="photos">
              {photos.map((u, i) => (
                <a key={i} href={u} target="_blank" rel="noopener noreferrer">
                  <img src={u} alt={`Your photo ${i + 1}`} loading="lazy" referrerPolicy="no-referrer" />
                </a>
              ))}
            </div>
          </section>
        )}

        <section className="section">
          <h2 className="section-title" style={{ padding: "0 6px" }}>Your 5 key measures</h2>
          <p className="section-sub" style={{ padding: "0 6px" }}>Each scored out of 100 — higher is healthier.</p>
          <div className="metrics">
            {CATS.map((m) => {
              const c = cats[m.key] || { score: 0, summary: "" };
              return (
                <div className="card metric fade-up" key={m.key}>
                  <div className="metric-top">
                    <div className="mini-ring">
                      <Ring size={58} stroke={6} score={c.score} />
                      <span style={{ color: color(c.score) }}>{c.score}</span>
                    </div>
                    <div>
                      <h3>{m.icon} {m.label}</h3>
                      <span className="text-xs muted">{label(c.score)}</span>
                    </div>
                  </div>
                  <p>{c.summary}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="section card fade-up">
          <h2 className="section-title">Your smile profile</h2>
          <p className="section-sub">Your scores (navy) compared with a typical healthy smile (dashed).</p>
          <div style={{ maxWidth: 460, margin: "0 auto" }}>
            <Radar items={CATS.map((m) => ({ label: m.short, value: cats[m.key]?.score || 0 }))} />
          </div>
        </section>

        {a.rootCanalRiskFlag && (
          <section className="section card fade-up" style={{ background: "var(--orange-soft)", borderColor: "#fde2c0" }}>
            <div className="flex gap-12 items-start">
              <div style={{ fontSize: 22 }}>🔬</div>
              <div>
                <div style={{ fontWeight: 700 }}>One tooth is worth having checked soon</div>
                <p className="text-sm" style={{ margin: "4px 0 12px", color: "#3a3a3c" }}>
                  {a.rootCanalRiskNote} Amend&apos;s microscopic root canal care is designed to be precise and comfortable if
                  treatment is ever needed.
                </p>
                <Ext href={BOOK} className="btn btn-orange btn-sm">Get it checked free</Ext>
              </div>
            </div>
          </section>
        )}

        <section className="section grid-2">
          <div className="card fade-up">
            <h2 className="section-title" style={{ fontSize: 18 }}>What&apos;s going well</h2>
            <p className="section-sub">Keep doing this.</p>
            {(a.strengths || []).length ? (
              a.strengths.map((s, i) => (
                <div className="list-item" key={i}>
                  <div className="dot" style={{ background: "var(--success-bg)", color: "var(--success)" }}>✓</div>
                  <div className="li-detail" style={{ margin: 0, alignSelf: "center" }}>{s}</div>
                </div>
              ))
            ) : (
              <p className="text-sm muted">Your dentist will point out your strengths at your consultation.</p>
            )}
          </div>
          <div className="card fade-up">
            <h2 className="section-title" style={{ fontSize: 18 }}>Worth a closer look</h2>
            <p className="section-sub">Most important first.</p>
            {attention.length ? (
              attention.map((x, i) => {
                const u = URGENCY[x.urgency] || URGENCY.routine;
                return (
                  <div className="list-item" key={i}>
                    <div className="dot" style={{ background: u.bg, color: u.fg, fontWeight: 700 }}>{u.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div className="flex justify-between items-center gap-8">
                        <span className="li-title">{x.title}</span>
                        <span className="badge" style={{ background: u.bg, color: u.fg }}>{u.label}</span>
                      </div>
                      {x.location && <div className="li-loc">📍 {x.location}</div>}
                      {x.detail && <div className="li-detail">{x.detail}</div>}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm muted">Nothing specific stood out — a great sign.</p>
            )}
          </div>
        </section>

        {detail && (
          <section className="section card fade-up">
            <h2 className="section-title">Your alignment map</h2>
            <p className="section-sub">Where crowding or spacing was noticed across your upper and lower teeth.</p>
            <AlignmentDiagram detail={detail} />
            {detail.biteNote && <p className="text-sm muted center" style={{ margin: "14px 0 0" }}>{detail.biteNote}</p>}
            {detail.alignerCandidate && (
              <div className="cta-inline card" style={{ marginTop: 20, boxShadow: "none" }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="eyebrow">Invisible Aligners</div>
                  <p className="text-sm" style={{ margin: "4px 0 0", color: "#3a3a3c" }}>
                    {detail.alignerNote || "Your smile shows patterns clear aligners commonly correct."} Amend&apos;s in-house
                    aligner lab means faster turnaround.
                  </p>
                </div>
                <Ext href={BOOK} className="btn btn-orange">Check my aligner fit</Ext>
              </div>
            )}
          </section>
        )}

        <section className="section">
          <h2 className="section-title" style={{ padding: "0 6px" }}>Recommended for you at Amend</h2>
          <p className="section-sub" style={{ padding: "0 6px" }}>Matched to your results — discuss any of these at your free consultation.</p>
          <div className="metrics">
            {(a.recommendedTreatments || []).map((t, i) => (
              <div className="card treat fade-up" key={i}>
                <div className="flex justify-between items-center">
                  <div className="treat-icon">{TREAT_ICON[t.service] || "🦷"}</div>
                  <span className={"badge " + (t.fit === "strong" ? "badge-orange" : "badge-neutral")}>
                    {t.fit === "strong" ? "Strong match" : "Worth discussing"}
                  </span>
                </div>
                <h3>{t.service}</h3>
                <p>{t.reason}</p>
                <Ext href={BOOK}>Ask about this →</Ext>
              </div>
            ))}
          </div>
        </section>

        {(a.habitInsights || []).length > 0 && (
          <section className="section card fade-up">
            <h2 className="section-title">Your daily care tips</h2>
            <p className="section-sub">Personalised from your answers.</p>
            {a.habitInsights.map((t, i) => (
              <div className="tip" key={i}>
                <div className="tip-num">{i + 1}</div>
                <div className="text-sm" style={{ paddingTop: 4 }}>{t}</div>
              </div>
            ))}
          </section>
        )}

        <section className="section card brand-gradient final-cta fade-up">
          <img src="/img/amend-mark.png" alt="" style={{ width: 64, margin: "0 auto", background: "#fff", borderRadius: 999, padding: 4 }} />
          <h2>Your free consultation is one message away</h2>
          <p>Our dentists will review this report with you, answer your questions, and build a plan that fits you — no obligation.</p>
          <div className="flex gap-12" style={{ justifyContent: "center", flexWrap: "wrap" }}>
            <Ext href={BOOK} className="btn btn-orange btn-lg">Book my free consultation</Ext>
            <Ext href={SITE} className="btn btn-white btn-lg">Visit {displayDomain(SITE)}</Ext>
          </div>
          <p className="text-xs" style={{ margin: "20px auto 0" }}>{siteConfig.branches}</p>
        </section>

        <section className="section card disclaimer">
          <div style={{ fontSize: 20 }}>ⓘ</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>This report is AI-generated</div>
            <p>
              It is an automated visual screening based on your photos and answers, created to help you understand your oral
              health — not a medical diagnosis. Photo quality, lighting and angle affect accuracy, and some conditions can
              only be detected with an in-person exam or X-ray. Please consult a qualified dentist before making any
              treatment decision. {a.professionalAdviceNote || ""}
            </p>
          </div>
        </section>

        <footer className="center" style={{ padding: "30px 0 10px" }}>
          <img src="/img/amend-logo.png" alt={siteConfig.clinicName} style={{ height: 30, margin: "0 auto 8px", opacity: 0.85 }} />
          <p className="text-xs muted" style={{ margin: 0 }}>
            <Ext href={SITE}><span style={{ color: "var(--navy)" }}>{displayDomain(SITE)}</span></Ext> · {siteConfig.branches}
          </p>
        </footer>
      </main>

      <div className={"sticky-cta no-print" + (showSticky ? " show" : "")}>
        <span className="txt">Free consultation · Limited slots</span>
        <Ext href={BOOK} className="btn btn-orange">Book my free consultation →</Ext>
      </div>
    </div>
  );
}
