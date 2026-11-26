import { NextResponse } from "next/server";
import { route, readJson, HttpError, str } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { verifyPassword, hashPassword } from "@/lib/data";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import {
  checkSuperAdmin, superAdminConfig, superFingerprint,
  loginBlocked, recordLoginFailure, clearLoginFailures,
} from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Compared against when the email is unknown, so the response time doesn't reveal which emails exist.
let dummyHash = null;
const getDummyHash = async () => (dummyHash ||= await hashPassword(Math.random().toString(36)));

export const POST = route(async (req) => {
  const body = await readJson(req);
  const email = str(body.email, 200).toLowerCase();
  const password = String(body.password || "");
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
  const key = `${ip}|${email}`;

  if (loginBlocked(key)) throw new HttpError(429, "Too many failed attempts. Please wait 15 minutes and try again.");
  if (!email || !password) throw new HttpError(400, "Enter your email and password.");

  let payload = null;
  let name = "";

  if (checkSuperAdmin(email, password)) {
    payload = { sub: "super", role: "super", ver: superFingerprint() };
    name = "Super Admin";
  } else {
    await connectDb();
    const user = await User.findOne({ email }).lean();
    const ok = await verifyPassword(password, user ? user.passwordHash : await getDummyHash());
    if (user && ok) {
      if (!user.active) throw new HttpError(403, "This account has been deactivated. Contact the Super Admin.");
      payload = { sub: String(user._id), role: "user", ver: user.tokenVersion || 0 };
      name = user.name;
      await User.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    }
  }

  if (!payload) {
    recordLoginFailure(key);
    if (!superAdminConfig().configured && !(await User.estimatedDocumentCount().catch(() => 0))) {
      throw new HttpError(401, "Super Admin is not set up yet: add SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD to the server's environment variables.");
    }
    throw new HttpError(401, "Invalid email or password.");
  }

  clearLoginFailures(key);
  const res = NextResponse.json({ ok: true, role: payload.role, name });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(payload), sessionCookieOptions());
  return res;
});
