"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";

export default function SettingsPage() {
  const [s, setS] = useState(null);
  const [banner, setBanner] = useState(null); // { type, text }
  const [general, setGeneral] = useState({ brandName: "", openaiApiKey: "", openaiModel: "" });
  const [account, setAccount] = useState({ newUsername: "", newPassword: "", currentPassword: "" });
  const [busy, setBusy] = useState("");

  function apply(settings) {
    setS(settings);
    setGeneral({ brandName: settings.brandName || "", openaiApiKey: "", openaiModel: settings.openaiModel || "gpt-4o" });
    setAccount((a) => ({ ...a, newUsername: settings.adminUsername || "" }));
  }

  useEffect(() => {
    api("/api/admin/settings").then((d) => apply(d.settings)).catch((err) => setBanner({ type: "error", text: err.message }));
  }, []);

  async function run(name, fn) {
    setBusy(name);
    setBanner(null);
    try {
      await fn();
    } catch (err) {
      setBanner({ type: "error", text: err.message });
    } finally {
      setBusy("");
    }
  }

  const saveGeneral = () =>
    run("general", async () => {
      const d = await api("/api/admin/settings", { method: "PUT", body: general, retries: 0 });
      apply(d.settings);
      setBanner({ type: "success", text: "Saved." });
    });

  const testKey = () =>
    run("test", async () => {
      const d = await api("/api/admin/settings/test-key", { method: "POST", body: { openaiApiKey: general.openaiApiKey }, retries: 0 });
      setBanner(d.ok ? { type: "success", text: "OpenAI key works!" } : { type: "error", text: d.error || "That key didn't work." });
    });

  const saveAccount = () =>
    run("account", async () => {
      const d = await api("/api/admin/account", { method: "POST", body: account, retries: 0 });
      setS(d.settings);
      if (d.errors && d.errors.length) setBanner({ type: "error", text: d.errors.join(" ") });
      else {
        setBanner({ type: "success", text: "Account settings updated." });
        setAccount((a) => ({ ...a, newPassword: "", currentPassword: "" }));
      }
    });

  return (
    <div style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Settings</h1>
      <p className="text-sm muted mb-16">AI, branding and your admin login. Database and photo storage are set in the server&apos;s environment variables.</p>

      {banner && <div className={"banner " + (banner.type === "success" ? "banner-success" : "banner-error")}>{banner.text}</div>}
      {s?.usingDefaultPassword && (
        <div className="banner banner-warn">⚠️ You are still using the default admin password. Change it below.</div>
      )}

      <div className="card mb-16">
        <h2 style={{ fontSize: 14, margin: "0 0 14px" }}>✦ Branding &amp; AI</h2>
        <div className="field">
          <label className="field-label" htmlFor="brandName">Clinic / brand name</label>
          <input id="brandName" type="text" value={general.brandName} onChange={(e) => setGeneral({ ...general, brandName: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="openaiKey">
            OpenAI API key{" "}
            {s?.openaiConfigured && (
              <span className="badge badge-success">configured{s.openaiKeySource === "env" ? " (from server env)" : ""}</span>
            )}
          </label>
          <input id="openaiKey" type="password" placeholder={s?.openaiConfigured ? "•••••••• (leave blank to keep)" : "sk-..."}
            autoComplete="off" value={general.openaiApiKey} onChange={(e) => setGeneral({ ...general, openaiApiKey: e.target.value })} />
          <p className="text-xs muted mt-8">
            Get one at{" "}
            <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener" style={{ color: "var(--brand)" }}>platform.openai.com/api-keys</a>.
            Needs access to a vision-capable model (gpt-4o).
          </p>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="openaiModel">Model</label>
          <input id="openaiModel" type="text" placeholder="gpt-4o" value={general.openaiModel} onChange={(e) => setGeneral({ ...general, openaiModel: e.target.value })} />
        </div>
        <div className="flex gap-8">
          <button className="btn btn-primary" onClick={saveGeneral} disabled={!s || busy === "general"}>{busy === "general" ? "Saving…" : "Save"}</button>
          <button className="btn btn-outline" onClick={testKey} disabled={!s || busy === "test"}>{busy === "test" ? "Testing…" : "🔑 Test key"}</button>
        </div>
      </div>

      <div className="card mb-16">
        <h2 style={{ fontSize: 14, margin: "0 0 14px" }}>📁 Where your data is stored</h2>
        <div className="text-sm" style={{ lineHeight: 1.8 }}>
          <div>🍃 <b>Leads, questions &amp; settings:</b> MongoDB{s?.databaseName ? <> — database <code>{s.databaseName}</code></> : null}</div>
          <div>
            🖼️ <b>Patient photos:</b>{" "}
            {s ? (s.storageConfigured ? <>Bunny Storage — zone <code>{s.storageZone}</code>, folder <code>{s.storageFolder}/photos</code> (private)</> : <span className="error-text">Bunny Storage not configured — set BUNNY_STORAGE_ZONE and BUNNY_STORAGE_API_KEY</span>) : "…"}
          </div>
        </div>
        <div className="flex gap-8 mt-16" style={{ flexWrap: "wrap" }}>
          <a className="btn btn-outline btn-sm" href="https://cloud.mongodb.com/" target="_blank" rel="noopener">Open MongoDB Atlas</a>
          <a className="btn btn-outline btn-sm" href="https://dash.bunny.net/storage" target="_blank" rel="noopener">Open Bunny Storage</a>
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 14, margin: "0 0 14px" }}>👤 Admin account</h2>
        <div className="field">
          <label className="field-label" htmlFor="newUsername">Username</label>
          <input id="newUsername" type="text" autoComplete="username" value={account.newUsername} onChange={(e) => setAccount({ ...account, newUsername: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="newPassword">New password (leave blank to keep current)</label>
          <input id="newPassword" type="password" autoComplete="new-password" value={account.newPassword} onChange={(e) => setAccount({ ...account, newPassword: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="currentPassword">Current password (required to change password)</label>
          <input id="currentPassword" type="password" autoComplete="current-password" value={account.currentPassword} onChange={(e) => setAccount({ ...account, currentPassword: e.target.value })} />
        </div>
        <button className="btn btn-primary" onClick={saveAccount} disabled={!s || busy === "account"}>{busy === "account" ? "Saving…" : "Update account"}</button>
      </div>
    </div>
  );
}
