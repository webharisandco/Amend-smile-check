// Who is signed in, and what they may see.
//
//  • Super Admin — email + password come ONLY from env vars (SUPER_ADMIN_EMAIL /
//    SUPER_ADMIN_PASSWORD). Sees and manages everything, including team users.
//  • Team user  — created by the Super Admin (stored in MongoDB, bcrypt-hashed).
//    Can do everything the Super Admin can EXCEPT manage team users.
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./auth.js";
import { HttpError } from "./http.js";
import { connectDb } from "./db.js";
import { User } from "./models.js";
import { superAdminConfig, superFingerprint } from "./credentials.js";

export {
  MIN_PASSWORD_LENGTH, superAdminConfig, superFingerprint, checkSuperAdmin, isSuperAdminEmail,
  loginBlocked, recordLoginFailure, clearLoginFailures,
} from "./credentials.js";

/** The signed-in person, or null. Team users are re-checked in the database every time,
 * so deactivating a user or resetting their password takes effect immediately. */
export async function getSession() {
  const store = await cookies();
  const p = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!p) return null;

  if (p.role === "super") {
    const c = superAdminConfig();
    if (!c.configured || p.ver !== superFingerprint()) return null;
    return { role: "super", userId: null, name: "Super Admin", email: c.email };
  }
  if (p.role === "user" && typeof p.sub === "string") {
    await connectDb();
    let u = null;
    try {
      u = await User.findById(p.sub).lean();
    } catch {
      return null; // malformed id
    }
    if (!u || !u.active || u.tokenVersion !== p.ver) return null;
    return { role: "user", userId: String(u._id), name: u.name, email: u.email };
  }
  return null;
}

export async function requireSession() {
  const s = await getSession();
  if (!s) throw new HttpError(401, "Not authorized. Please log in again.");
  return s;
}

export async function requireSuper() {
  const s = await requireSession();
  if (s.role !== "super") throw new HttpError(403, "Only the Super Admin can do this.");
  return s;
}

/** MongoDB filter for the leads / links this person may see. Every signed-in person
 * (Super Admin and team users) sees all of them; only user management is Super-Admin-only. */
export const ownerScope = () => ({});
