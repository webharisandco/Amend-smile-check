// Admin session = a signed JWT in an httpOnly cookie. This file must stay
// edge-compatible (it's imported by middleware.js), so: no database, no bcrypt.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "amend_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET is missing or too short (needs 32+ characters). See .env.example.");
  }
  return new TextEncoder().encode(secret);
}

/** payload = { sub, role: "super" | "user", ver } — checked again in lib/session.js on every request. */
export async function createSessionToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Returns the session payload, or null if missing/invalid/expired. Never throws. */
export async function verifySessionToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    // Set COOKIE_SECURE=false only if you must test the production build over plain http.
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  };
}
