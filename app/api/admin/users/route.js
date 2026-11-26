import { NextResponse } from "next/server";
import { route, readJson, HttpError, str } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { User } from "@/lib/models";
import { hashPassword, listUsers } from "@/lib/data";
import { requireSuper, requireSession, isSuperAdminEmail, MIN_PASSWORD_LENGTH } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** All team users. The Super Admin gets full details (for user management); team users
 * get just names, for the owner filters and dropdowns. */
export const GET = route(async () => {
  const s = await requireSession();
  const users = await listUsers();
  return NextResponse.json({
    users: s.role === "super" ? users : users.map(({ id, name, active }) => ({ id, name, active })),
  });
});

/** Create a team user. Body: { name, email, password } */
export const POST = route(async (req) => {
  await requireSuper();
  const body = await readJson(req);
  const name = str(body.name, 120);
  const email = str(body.email, 200).toLowerCase();
  const password = String(body.password || "");
  if (!name) throw new HttpError(400, "Enter the user's name.");
  if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email address.");
  if (isSuperAdminEmail(email)) throw new HttpError(400, "That email is the Super Admin's. Use a different email.");
  if (password.length < MIN_PASSWORD_LENGTH) throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);

  await connectDb();
  try {
    await User.create({ name, email, passwordHash: await hashPassword(password) });
  } catch (err) {
    if (err.code === 11000) throw new HttpError(409, "A user with this email already exists.");
    throw err;
  }
  return NextResponse.json({ users: await listUsers() });
});
