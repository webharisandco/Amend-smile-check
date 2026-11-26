"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, fmtDate } from "@/lib/client/api";
import { STATUSES, TEMP_META, isAligner, leadHook, waLink, reportLink, updateLead, siteOrigin, copyText } from "@/lib/client/admin";
import { useMe } from "@/components/AdminContext";

const DAY = 864e5;
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
const leadHref = (l) => `/admin/leads/${encodeURIComponent(l.leadId)}`;

function Kpi({ label, value, sub, color }) {
  return (
    <div className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={{ color: color || "var(--ink)" }}>{value}</div>
      {sub ? <div className="stat-sub">{sub}</div> : null}
    </div>
  );
}

function Bars({ entries, color }) {
  if (!entries.length) return <p className="text-sm muted">No data yet.</p>;
  const max = Math.max(1, ...entries.map((e) => e[1]));
  return entries.map(([k, v]) => (
    <div className="row" key={k}>
      <span title={k}>{k}</span>
      <div className="track"><div className="fill" style={{ width: `${(v / max) * 100}%`, background: color }} /></div>
      <b>{v}</b>
    </div>
  ));
}

export default function DashboardPage() {
  const me = useMe();
  const fullAccess = Boolean(me); // Super Admin and team users both see everything
  const [leads, setLeads] = useState(null);
  const [settings, setSettings] = useState(null);
  const [users, setUsers] = useState([]);
  const [owner, setOwner] = useState("all"); // Super Admin: "all" | "none" | userId
  const [error, setError] = useState("");
  const [greeting, setGreeting] = useState("");
  const [copied, setCopied] = useState(false);
  const [f, setF] = useState({ q: "", temp: "all", status: "all", alignerOnly: false, sort: "recent" });

  async function load() {
    setError("");
    try {
      const [l, s, u] = await Promise.all([
        api("/api/admin/leads"),
        fullAccess ? api("/api/admin/settings") : null,
        fullAccess ? api("/api/admin/users") : null,
      ]);
      setLeads(l.leads || []);
      if (s) setSettings(s.settings || {});
      if (u) setUsers(u.users || []);
    } catch (err) {
      setError(err.message);
      setLeads((prev) => prev || []);
    }
  }

  useEffect(() => {
    const h = new Date().getHours();
    setGreeting(
      (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening") +
        " · " +
        new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })
    );
  }, []);

  useEffect(() => {
    if (me) load();
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  // Everything on this page (KPIs, queue, charts, table) follows the owner selector.
  const all = useMemo(() => {
    const list = leads || [];
    if (!fullAccess || owner === "all") return list;
    if (owner === "none") return list.filter((l) => !l.ownerId);
    return list.filter((l) => l.ownerId === owner);
  }, [leads, owner, fullAccess]);

  async function setStatus(lead, status) {
    const prev = lead.status;
    setLeads((ls) => ls.map((x) => (x.leadId === lead.leadId ? { ...x, status } : x)));
    try {
      await updateLead(lead.leadId, { status });
    } catch (err) {
      alert(err.message);
      setLeads((ls) => ls.map((x) => (x.leadId === lead.leadId ? { ...x, status: prev } : x)));
    }
  }
  // Contacting a new lead from the dashboard auto-moves it to "Contacted".
  const markContacted = (lead) => {
    if (lead.status === "new") setStatus(lead, "contacted");
  };

  const stats = useMemo(() => {
    const n = all.length;
    const today = dayKey(new Date());
    const weekAgo = Date.now() - 7 * DAY;
    const reached = all.filter((l) => ["contacted", "booked", "converted"].includes(l.status)).length;
    const won = all.filter((l) => ["booked", "converted"].includes(l.status)).length;
    const aligner = all.filter(isAligner).length;
    return {
      n,
      todayN: all.filter((l) => dayKey(l.timestamp) === today).length,
      weekN: all.filter((l) => new Date(l.timestamp).getTime() >= weekAgo).length,
      hotOpen: all.filter((l) => l.temperature === "hot" && l.status === "new").length,
      aligner,
      reached,
      won,
      avg: n ? Math.round(all.reduce((s, l) => s + (l.oralHealthScore || 0), 0) / n) : "—",
    };
  }, [all]);

  const queue = useMemo(
    () => all.filter((l) => l.status === "new" && (l.temperature === "hot" || isAligner(l))).sort((a, b) => b.riskScore - a.riskScore),
    [all]
  );

  const charts = useMemo(() => {
    const days = [...Array(14)].map((_, i) => dayKey(Date.now() - (13 - i) * DAY));
    const counts = days.map((d) => all.filter((l) => dayKey(l.timestamp) === d).length);
    const treat = {};
    all.forEach((l) =>
      (l.analysis?.recommendedTreatments || []).forEach((r) => {
        if (r.service !== "Routine Check-up") treat[r.service] = (treat[r.service] || 0) + 1;
      })
    );
    const src = {};
    all.forEach((l) => {
      const k = l.refSource || "direct";
      src[k] = (src[k] || 0) + 1;
    });
    const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6);
    return { days, counts, max: Math.max(1, ...counts), treat: top(treat), src: top(src) };
  }, [all]);

  const filtered = useMemo(() => {
    const q = f.q.trim().toLowerCase();
    const list = all.filter(
      (l) =>
        (f.temp === "all" || l.temperature === f.temp) &&
        (f.status === "all" || l.status === f.status) &&
        (!f.alignerOnly || isAligner(l)) &&
        (!q || `${l.name} ${l.phone} ${l.email}`.toLowerCase().includes(q))
    );
    if (f.sort === "recent") list.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
    if (f.sort === "risk") list.sort((a, b) => b.riskScore - a.riskScore);
    if (f.sort === "score") list.sort((a, b) => a.oralHealthScore - b.oralHealthScore);
    return list;
  }, [all, f]);

  function exportCsv() {
    const rows = [["Date", "Name", "Phone", "Email", "Source", "Owner", "Oral score", "Heat", "Risk", "Aligner candidate", "Opportunity", "Stage", "Report link", "Notes"]];
    filtered.forEach((l) =>
      rows.push([l.timestamp, l.name, l.phone, l.email, l.refSource, l.ownerName || "Unassigned", l.oralHealthScore, l.temperature, l.riskScore,
        isAligner(l) ? "Yes" : "No", leadHook(l), l.status, reportLink(l), l.notes])
    );
    // Prefix cells that start with = + - @ so spreadsheet apps don't run them as formulas.
    const cell = (v) => {
      let s = String(v == null ? "" : v);
      if (/^[=+\-@]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `amend-leads-${dayKey(new Date())}.csv`;
    a.click();
  }

  async function copyTestLink() {
    if (await copyText(`${siteOrigin()}/test`)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  const setFilter = (patch) => setF((x) => ({ ...x, ...patch }));
  const n = stats.n;
  const scoreColor = (s) => (s >= 65 ? "var(--navy)" : s >= 45 ? "var(--orange)" : "var(--danger)");

  return (
    <div className="dash">
      <div className="head">
        <div>
          <div className="eyebrow">{greeting}</div>
          <h1>Lead dashboard</h1>
        </div>
        <div className="flex gap-8 items-center" style={{ flexWrap: "wrap" }}>
          {fullAccess && (
            <label className="text-sm flex items-center gap-8" style={{ whiteSpace: "nowrap" }}>
              <span className="muted">Showing</span>
              <select value={owner} onChange={(e) => setOwner(e.target.value)} style={{ width: "auto", padding: "7px 10px", fontSize: 13 }}>
                <option value="all">All users</option>
                <option value="none">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.active ? "" : " (deactivated)"}</option>)}
              </select>
            </label>
          )}
          <button className="btn btn-outline btn-sm" onClick={copyTestLink}>{copied ? "✓ Copied" : "🔗 Copy test link"}</button>
          <button className="btn btn-outline btn-sm" onClick={exportCsv} disabled={!filtered.length}>⬇ Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={load}>↻ Refresh</button>
        </div>
      </div>

      {settings && (!settings.openaiConfigured || !settings.storageConfigured) && (
        <div className="banner banner-warn">
          <strong>Finish setup:</strong>{" "}
          {[
            !settings.openaiConfigured && "add your OpenAI API key",
            !settings.storageConfigured && "set the BUNNY_STORAGE_* settings so photos can be saved",
          ].filter(Boolean).join(" · ")}
          . <Link href="/admin/settings">Open Settings →</Link>
        </div>
      )}
      {error && <div className="banner banner-error">{error}</div>}

      <div className="stat-grid">
        <Kpi label="Tests taken" value={n} sub={`${stats.todayN} today · ${stats.weekN} this week`} />
        <Kpi label="Hot & uncontacted" value={stats.hotOpen} sub="Act on these today" color={stats.hotOpen ? "var(--danger)" : null} />
        <Kpi label="Aligner candidates" value={stats.aligner} sub={n ? `${Math.round((stats.aligner / n) * 100)}% of all tests` : ""} color="var(--orange)" />
        <Kpi label="Contact rate" value={n ? Math.round((stats.reached / n) * 100) + "%" : "—"} sub={`${stats.reached} of ${n} reached`} />
        <Kpi label="Booked + converted" value={stats.won} sub={n ? `${Math.round((stats.won / n) * 100)}% of tests` : ""} color="var(--success)" />
        <Kpi label="Avg oral score" value={stats.avg} sub="Across all tests" color="var(--navy)" />
      </div>

      <div className="card mb-16">
        <div className="flex justify-between items-center mb-16" style={{ flexWrap: "wrap", gap: 8 }}>
          <div>
            <h2 style={{ fontSize: 18, margin: 0 }}>Contact these first</h2>
            <p className="text-sm muted" style={{ margin: "2px 0 0" }}>Hot leads and aligner candidates you haven&apos;t reached yet — ranked by opportunity.</p>
          </div>
          <span className="badge badge-danger">{queue.length} waiting</span>
        </div>
        <div className="queue">
          {!queue.length && <p className="text-sm muted">🎉 You&apos;re all caught up — no hot leads waiting.</p>}
          {queue.slice(0, 9).map((l) => {
            const t = TEMP_META[l.temperature] || TEMP_META.cold;
            return (
              <div className="card q-card" key={l.leadId}>
                <div className="q-top">
                  <div>
                    <Link className="q-name" href={leadHref(l)}>{l.name || "Anonymous"}</Link>
                    <div className="text-xs muted">{l.phone || l.email || ""} · {fmtDate(l.timestamp)}</div>
                  </div>
                  <span className={"badge " + t.cls}>{t.icon} {l.riskScore}</span>
                </div>
                <div className="text-sm">
                  <span className={"badge " + (isAligner(l) ? "badge-orange" : "badge-brand")}>{leadHook(l)}</span>
                  <span className="text-xs muted" style={{ marginLeft: 6 }}>Score {l.oralHealthScore}/100</span>
                </div>
                <div className="q-actions">
                  {l.phone && (
                    <>
                      <a className="btn btn-whatsapp btn-sm" href={waLink(l)} target="_blank" rel="noopener" onClick={() => markContacted(l)}>WhatsApp</a>
                      <a className="btn btn-outline btn-sm" href={`tel:${l.phone}`} onClick={() => markContacted(l)}>Call</a>
                    </>
                  )}
                  <Link className="btn btn-ghost btn-sm" href={leadHref(l)}>Open →</Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card mb-16">
        <h2 style={{ fontSize: 18, margin: "0 0 4px" }}>Pipeline</h2>
        <p className="text-sm muted" style={{ margin: "0 0 14px" }}>Click a stage to filter the table below.</p>
        <div className="funnel">
          {STATUSES.map((s) => {
            const c = all.filter((l) => l.status === s.key).length;
            return (
              <button key={s.key} className={"fstep" + (f.status === s.key ? " active" : "")}
                onClick={() => setFilter({ status: f.status === s.key ? "all" : s.key })}>
                <span className={"badge " + s.cls}>{s.label}</span>
                <b>{c}</b>
                <span className="pct">{Math.round((c / (n || 1)) * 100)}%</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid-3 mb-16">
        <div className="card">
          <h3 style={{ fontSize: 15, margin: "0 0 14px" }}>Tests · last 14 days</h3>
          <div className="spark-bars">
            {leads !== null && charts.counts.map((c, i) => (
              <div key={charts.days[i]} className={i === 13 ? "today" : ""} style={{ height: `${(c / charts.max) * 100}%` }}
                data-tip={`${new Date(charts.days[i]).toLocaleDateString(undefined, { day: "numeric", month: "short" })}: ${c}`} />
            ))}
          </div>
          <div className="flex justify-between text-xs muted mt-8">
            <span>{leads !== null && new Date(charts.days[0]).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
            <span>Today</span>
          </div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, margin: "0 0 14px" }}>Treatment opportunities</h3>
          <div className="bars"><Bars entries={charts.treat} color="var(--orange)" /></div>
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, margin: "0 0 14px" }}>Lead sources</h3>
          <div className="bars"><Bars entries={charts.src} color="var(--navy)" /></div>
        </div>
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div className="table-toolbar">
          <input type="text" placeholder="Search name, phone, email…" style={{ minWidth: 200, flex: 1, maxWidth: 280 }}
            value={f.q} onChange={(e) => setFilter({ q: e.target.value })} />
          <select value={f.temp} onChange={(e) => setFilter({ temp: e.target.value })}>
            <option value="all">All temperatures</option>
            <option value="hot">🔥 Hot</option>
            <option value="warm">Warm</option>
            <option value="cold">Cold</option>
          </select>
          <select value={f.status} onChange={(e) => setFilter({ status: e.target.value })}>
            <option value="all">All stages</option>
            {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <label className="text-sm flex items-center gap-8" style={{ whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={f.alignerOnly} onChange={(e) => setFilter({ alignerOnly: e.target.checked })} /> Aligner candidates
          </label>
          <select value={f.sort} onChange={(e) => setFilter({ sort: e.target.value })}>
            <option value="recent">Newest first</option>
            <option value="risk">Highest opportunity</option>
            <option value="score">Lowest oral score</option>
          </select>
          <div className="spacer" />
          <span className="text-xs muted">{filtered.length} of {n}</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr><th>Lead</th><th>Score</th><th>Heat</th><th>Opportunity</th><th>Source</th>{fullAccess && <th>Owner</th>}<th>Stage</th><th>Date</th><th></th></tr>
            </thead>
            <tbody>
              {leads === null && (
                <tr><td colSpan={fullAccess ? 9 : 8} className="center muted" style={{ padding: 40 }}>Loading…</td></tr>
              )}
              {leads !== null && !filtered.length && (
                <tr><td colSpan={fullAccess ? 9 : 8} className="center muted" style={{ padding: 40 }}>{n ? "No leads match these filters." : "No tests taken yet — share your test link to get started."}</td></tr>
              )}
              {filtered.map((l) => {
                const t = TEMP_META[l.temperature] || TEMP_META.cold;
                return (
                  <tr key={l.leadId}>
                    <td>
                      <Link className="lead-link" href={leadHref(l)}>{l.name || "Anonymous"}</Link>
                      <div className="text-xs muted">{l.phone || l.email || "No contact"}</div>
                    </td>
                    <td><b style={{ color: scoreColor(l.oralHealthScore) }}>{l.oralHealthScore}</b></td>
                    <td><span className={"badge " + t.cls}>{t.icon} {t.label}</span></td>
                    <td><span className={"badge " + (isAligner(l) ? "badge-orange" : "badge-neutral")}>{leadHook(l)}</span></td>
                    <td className="text-xs muted">{l.refSource || "direct"}</td>
                    {fullAccess && <td className="text-xs">{l.ownerName || <span className="muted">Unassigned</span>}</td>}
                    <td>
                      <select className="status-select" value={l.status} onChange={(e) => setStatus(l, e.target.value)}>
                        {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                    <td className="text-xs muted" style={{ whiteSpace: "nowrap" }}>{fmtDate(l.timestamp)}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {l.phone && <a className="icon-btn" title="WhatsApp" href={waLink(l)} target="_blank" rel="noopener" onClick={() => markContacted(l)}>💬</a>}
                      <a className="icon-btn" title="Patient report" href={reportLink(l)} target="_blank" rel="noopener">📄</a>
                      <Link className="icon-btn" title="Open lead" href={leadHref(l)}>→</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
