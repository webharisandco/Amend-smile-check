import { NextResponse } from "next/server";
import { route, readJson, HttpError, str } from "@/lib/http";
import { getSettings, verifyAdminPassword } from "@/lib/data";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req) => {
  const body = await readJson(req);
  const username = str(body.username, 120);
  const password = String(body.password || "");
  const s = await getSettings();

  const userOk = username.toLowerCase() === String(s.adminUsername || "").trim().toLowerCase();
  const passOk = await verifyAdminPassword(s, password); // always run, so timing doesn't reveal the username
  if (!username || !userOk || !passOk) throw new HttpError(401, "Invalid username or password.");

  const res = NextResponse.json({ ok: true, username: s.adminUsername });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(s.adminUsername), sessionCookieOptions());
  return res;
});
