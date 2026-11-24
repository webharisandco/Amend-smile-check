"use client";

import { useState } from "react";
import { api } from "@/lib/client/api";
import { siteConfig } from "@/lib/config";

export default function AdminLoginForm() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/api/admin/login", { method: "POST", body: { username, password }, retries: 0 });
      window.location.href = "/admin"; // full load so the new session cookie is used everywhere
    } catch (err) {
      setError(err.message || "Login failed.");
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-box">
        <div className="center" style={{ marginBottom: 28 }}>
          <img src="/img/amend-logo.png" alt={siteConfig.clinicName} style={{ height: 44, margin: "0 auto 14px" }} />
          <div style={{ fontWeight: 700 }}>AI Smile Check · Admin</div>
          <div className="text-sm muted">Sign in to manage leads &amp; settings</div>
        </div>
        <form className="card" onSubmit={onSubmit} style={{ boxShadow: "0 20px 40px -10px rgba(0,0,0,0.25)" }}>
          <div className="field">
            <label className="field-label" htmlFor="username">Username</label>
            <input id="username" type="text" required autoFocus autoComplete="username" value={username}
              onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="password">Password</label>
            <input id="password" type="password" required autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm error-text" style={{ marginBottom: 12 }}>{error}</p>}
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? "Signing in…" : "🔒 Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
