import { NextResponse } from "next/server";
import { route, readJson, HttpError } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { hashPassword, verifyPassword } from "@/lib/data";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { requireSession, MIN_PASSWORD_LENGTH } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A team user changes their own password. (The Super Admin's lives in env vars.) */
export const POST = route(async (req) => {
  const s = await requireSession();
  if (s.role === "super") {
    throw new HttpError(400, "The Super Admin password is set in the server's environment variables (SUPER_ADMIN_PASSWORD).");
  }
  const body = await readJson(req);
  const newPassword = String(body.newPassword || "");
  await connectDb();
  const user = await User.findById(s.userId).lean();
  if (!(await verifyPassword(body.currentPassword, user?.passwordHash))) {
    throw new HttpError(400, "Current password is incorrect.");
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new HttpError(400, `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  const updated = await User.findByIdAndUpdate(
    user._id,
    { $set: { passwordHash: await hashPassword(newPassword) }, $inc: { tokenVersion: 1 } },
    { new: true, lean: true }
  );
  // Other devices are signed out; keep this one signed in with a fresh session.
  const res = NextResponse.json({ ok: true });
  res.cookies.set(
    SESSION_COOKIE,
    await createSessionToken({ sub: String(updated._id), role: "user", ver: updated.tokenVersion }),
    sessionCookieOptions()
  );
  return res;
});
