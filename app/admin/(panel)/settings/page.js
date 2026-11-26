"use client";

import { useEffect, useState } from "react";
import { api, fmtDate } from "@/lib/client/api";
import { useMe } from "@/components/AdminContext";

function Banner({ banner }) {
  if (!banner) return null;
  return <div className={"banner " + (banner.type === "success" ? "banner-success" : "banner-error")}>{banner.text}</div>;
}

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint32Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

// ── Team users (Super Admin) ─────────────────────────────────────────────
function TeamUsers() {
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    api("/api/admin/users").then((d) => setUsers(d.users)).catch((err) => setBanner({ type: "error", text: err.message }));
  }, []);

  async function run(key, fn, okText) {
    setBusy(key);
    setBanner(null);
    try {
      const d = await fn();
      if (d?.users) setUsers(d.users);
      if (okText) setBanner({ type: "success", text: okText });
      return true;
    } catch (err) {
      setBanner({ type: "error", text: err.message });
      return false;
    } finally {
      setBusy("");
    }
  }

  async function create() {
    const pw = form.password;
    const ok = await run("create", () => api("/api/admin/users", { method: "POST", body: form, retries: 0 }),
      `User created. Share these login details with ${form.name.trim()}: email ${form.email.trim()} · password ${pw}`);
    if (ok) setForm({ name: "", email: "", password: "" });
  }

  const patch = (u, body, okText) =>
    run(u.id, () => api(`/api/admin/users/${u.id}`, { method: "PATCH", body, retries: 0 }), okText);

  function resetPassword(u) {
    const pw = window.prompt(`New password for ${u.name} (at least 8 characters).\nLeave as-is to use this generated one:`, randomPassword());
    if (pw == null) return;
    patch(u, { password: pw }, `Password reset for ${u.name}. New password: ${pw} — they've been signed out everywhere.`);
  }

  function rename(u) {
    const name = window.prompt("Name", u.name);
    if (name == null || !name.trim() || name.trim() === u.name) return;
    patch(u, { name }, "Name updated.");
  }

  function remove(u) {
    if (!window.confirm(`Delete ${u.name}?\n\nThey won't be able to log in any more. Their ${u.leadCount} lead(s) and their share links are kept, but become unassigned (only you will see them, until you reassign them).`)) return;
    run(u.id, () => api(`/api/admin/users/${u.id}`, { method: "DELETE", retries: 0 }), `${u.name} was deleted.`);
  }

  return (
    <div className="card mb-16">
      <h2 style={{ fontSize: 14, margin: "0 0 4px" }}>👥 Team users</h2>
      <p className="text-sm muted" style={{ margin: "0 0 14px" }}>
        People you add here can log in to the admin with the email and password you give them. They can see and do
        everything in the admin <b>except manage team users</b>. Leads that come through a user&apos;s share link are
        assigned to them.
      </p>
      <Banner banner={banner} />

      <div className="grid-3">
        <div className="field">
          <label className="field-label" htmlFor="uName">Name</label>
          <input id="uName" type="text" placeholder="e.g. Calicut front desk" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="uEmail">Email (login)</label>
          <input id="uEmail" type="email" autoComplete="off" placeholder="name@clinic.com" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="uPass">Password</label>
          <div className="flex gap-8">
            <input id="uPass" type="text" autoComplete="new-password" placeholder="8+ characters" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" className="btn btn-outline btn-sm" title="Generate a strong password"
              onClick={() => setForm({ ...form, password: randomPassword() })}>🎲</button>
          </div>
        </div>
      </div>
      <button className="btn btn-primary" disabled={busy === "create" || !form.name || !form.email || !form.password} onClick={create}>
        {busy === "create" ? "Creating…" : "➕ Create user"}
      </button>

      <div style={{ overflowX: "auto", marginTop: 20 }}>
        <table className="data-table">
          <thead><tr><th>User</th><th>Leads</th><th>Last login</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users === null && <tr><td colSpan={5} className="muted center" style={{ padding: 24 }}>Loading…</td></tr>}
            {users && !users.length && <tr><td colSpan={5} className="muted center" style={{ padding: 24 }}>No team users yet.</td></tr>}
            {users?.map((u) => (
              <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                <td><b>{u.name}</b><div className="text-xs muted">{u.email}</div></td>
                <td>{u.leadCount}</td>
                <td className="text-xs muted">{u.lastLoginAt ? fmtDate(u.lastLoginAt) : "Never"}</td>
                <td><span className={"badge " + (u.active ? "badge-success" : "badge-neutral")}>{u.active ? "Active" : "Deactivated"}</span></td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-ghost btn-sm" disabled={busy === u.id} onClick={() => rename(u)}>Rename</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy === u.id} onClick={() => resetPassword(u)}>Reset password</button>
                  <button className="btn btn-ghost btn-sm" disabled={busy === u.id}
                    onClick={() => patch(u, { active: !u.active }, u.active ? `${u.name} can no longer log in.` : `${u.name} can log in again.`)}>
                    {u.active ? "Deactivate" : "Activate"}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: "var(--danger)" }} disabled={busy === u.id} onClick={() => remove(u)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── App settings (everyone); Team users + Super Admin card only for the Super Admin ──
function AppSettings({ me }) {
  const isSuper = me.role === "super";
  const [s, setS] = useState(null);
  const [banner, setBanner] = useState(null);
  const [general, setGeneral] = useState({ brandName: "", openaiApiKey: "", openaiModel: "" });
  const [busy, setBusy] = useState("");

  function apply(settings) {
    setS(settings);
    setGeneral({ brandName: settings.brandName || "", openaiApiKey: "", openaiModel: settings.openaiModel || "gpt-4o" });
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

  return (
    <>
      <Banner banner={banner} />

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

      {isSuper && <TeamUsers />}

      <div className="card mb-16">
        <h2 style={{ fontSize: 14, margin: "0 0 14px" }}>📁 Where your data is stored</h2>
        <div className="text-sm" style={{ lineHeight: 1.8 }}>
          <div>🍃 <b>Leads, questions, users &amp; settings:</b> MongoDB{s?.databaseName ? <> — database <code>{s.databaseName}</code></> : null}</div>
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

      {isSuper ? <div className="card">
        <h2 style={{ fontSize: 14, margin: "0 0 14px" }}>🛡️ Super Admin account</h2>
        <p className="text-sm" style={{ margin: "0 0 6px" }}>Signed in as <b>{s?.superAdminEmail || "…"}</b></p>
        <p className="text-sm muted" style={{ margin: 0 }}>
          The Super Admin email and password are set only in the server&apos;s environment variables
          (<code>SUPER_ADMIN_EMAIL</code>, <code>SUPER_ADMIN_PASSWORD</code>), never in the database. To change them,
          edit those values and restart the app. All existing Super Admin sessions are then signed out.
        </p>
      </div> : <MyAccount me={me} />}
    </>
  );
}

// ── Team user: own account ───────────────────────────────────────────────
function MyAccount({ me }) {
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "" });
  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setBanner(null);
    try {
      await api("/api/admin/account", { method: "POST", body: pw, retries: 0 });
      setBanner({ type: "success", text: "Password changed. Other devices have been signed out." });
      setPw({ currentPassword: "", newPassword: "" });
    } catch (err) {
      setBanner({ type: "error", text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 14, margin: "0 0 14px" }}>👤 My account</h2>
      <Banner banner={banner} />
      <div className="kv-simple text-sm mb-16">
        <div><span className="muted">Name:</span> <b>{me.name}</b></div>
        <div><span className="muted">Email (login):</span> <b>{me.email}</b></div>
        <div className="text-xs muted mt-8">To change your name or email, ask the Super Admin.</div>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="currentPassword">Current password</label>
        <input id="currentPassword" type="password" autoComplete="current-password" value={pw.currentPassword}
          onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="newPassword">New password (8+ characters)</label>
        <input id="newPassword" type="password" autoComplete="new-password" value={pw.newPassword}
          onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
      </div>
      <button className="btn btn-primary" onClick={save} disabled={busy || !pw.currentPassword || !pw.newPassword}>
        {busy ? "Saving…" : "Change password"}
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const me = useMe();
  const isSuper = me?.role === "super";
  return (
    <div style={{ maxWidth: 860 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 4px" }}>Settings</h1>
      <p className="text-sm muted mb-16">
        {isSuper ? "AI, branding, team users and where your data is stored." : "AI, branding, where your data is stored, and your login."}
      </p>
      {!me ? <p className="muted">Loading…</p> : <AppSettings me={me} />}
    </div>
  );
}
