"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { siteOrigin, copyText } from "@/lib/client/admin";

export default function LinksPage() {
  const [links, setLinks] = useState(null);
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(siteOrigin());
    api("/api/admin/links").then((d) => setLinks(d.links || [])).catch((err) => setError(err.message));
  }, []);

  const urlFor = (c) => `${origin}/test?ref=${encodeURIComponent(c)}`;

  async function create() {
    setBusy(true);
    setError("");
    try {
      const d = await api("/api/admin/links", { method: "POST", body: { label, code }, retries: 0 });
      setLinks(d.links || []);
      setLabel("");
      setCode("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    if (!window.confirm("Delete this link? Leads that already came through it keep their source label.")) return;
    try {
      const d = await api(`/api/admin/links/${encodeURIComponent(c)}`, { method: "DELETE", retries: 0 });
      setLinks(d.links || []);
    } catch (err) {
      setError(err.message);
    }
  }

  async function copy(c) {
    if (await copyText(urlFor(c))) {
      setCopied(c);
      setTimeout(() => setCopied(""), 1500);
    }
  }

  return (
    <div style={{ maxWidth: 700 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Share Links</h1>
      <p className="text-sm muted mb-16">Generate trackable test links for Instagram bio, WhatsApp broadcasts, in-clinic QR codes, etc.</p>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="card mb-16">
        <h2 style={{ fontSize: 14, margin: "0 0 14px" }}>New link</h2>
        <div className="grid-2">
          <div className="field">
            <label className="field-label" htmlFor="linkLabel">Label (for your reference)</label>
            <input id="linkLabel" type="text" placeholder="Instagram bio link" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="linkCode">Custom code (optional)</label>
            <input id="linkCode" type="text" placeholder="instagram" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={create} disabled={busy}>➕ Generate link</button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {!links && <p className="center muted" style={{ padding: "40px 0" }}>Loading…</p>}
        {links && !links.length && <p className="center muted" style={{ padding: "40px 0" }}>No links yet — generate your first one above.</p>}
        {links?.map((l) => (
          <div key={l.code} className="flex items-center gap-12" style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ background: "var(--brand-light)", color: "var(--brand-dark)", borderRadius: 10, padding: "8px 10px" }}>🔗</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.label}</div>
              <div className="text-xs muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{urlFor(l.code)}</div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={() => copy(l.code)}>{copied === l.code ? "✅ Copied" : "📋 Copy"}</button>
            <button className="btn btn-ghost btn-sm" title="Delete" onClick={() => remove(l.code)}>🗑️</button>
          </div>
        ))}
      </div>
    </div>
  );
}
