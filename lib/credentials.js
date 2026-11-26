// Pure credential helpers (no Next.js / database imports) — used by lib/session.js
// and the login route, and unit-tested in test/logic.test.js.
import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 8;

/** The Super Admin login comes ONLY from env vars — never the database. */
export function superAdminConfig() {
  const email = String(process.env.SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.SUPER_ADMIN_PASSWORD || "");
  return { email, password, configured: Boolean(email && password.length >= MIN_PASSWORD_LENGTH) };
}

const sha = (s) => createHash("sha256").update(String(s)).digest();

/** Changes whenever the Super Admin email/password changes, which signs out old sessions. */
export function superFingerprint() {
  const { email, password } = superAdminConfig();
  return createHash("sha256")
    .update(`${email}\n${password}\n${process.env.AUTH_SECRET || ""}`)
    .digest("base64url")
    .slice(0, 22);
}

/** Constant-time check of the Super Admin credentials. */
export function checkSuperAdmin(email, password) {
  const c = superAdminConfig();
  if (!c.configured) return false;
  const okEmail = timingSafeEqual(sha(String(email || "").trim().toLowerCase()), sha(c.email));
  const okPass = timingSafeEqual(sha(password || ""), sha(c.password));
  return okEmail && okPass;
}

export const isSuperAdminEmail = (email) => {
  const c = superAdminConfig();
  return Boolean(c.email) && String(email || "").trim().toLowerCase() === c.email;
};

// ── Login attempt limiter (per IP + email, in memory) ─────────────────────
const attempts = new Map();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS = 8;

export function loginBlocked(key) {
  const a = attempts.get(key);
  if (!a) return false;
  if (Date.now() - a.first > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return a.count >= MAX_FAILS;
}
export function recordLoginFailure(key) {
  const a = attempts.get(key);
  if (!a || Date.now() - a.first > WINDOW_MS) attempts.set(key, { count: 1, first: Date.now() });
  else a.count++;
  if (attempts.size > 5000) attempts.clear(); // keep memory bounded
}
export const clearLoginFailures = (key) => attempts.delete(key);
