import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { route, readJson, HttpError, str } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { Lead, Link, User } from "@/lib/models";
import { hashPassword, listUsers } from "@/lib/data";
import { requireSuper, MIN_PASSWORD_LENGTH } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadUser(ctx) {
  const { id } = await ctx.params;
  if (!mongoose.isValidObjectId(id)) throw new HttpError(404, "User not found.");
  await connectDb();
  const user = await User.findById(id).lean();
  if (!user) throw new HttpError(404, "User not found.");
  return user;
}

/** Update a user. Body (all optional): { name, active, password } — a new password or
 * deactivation signs the user out everywhere. */
export const PATCH = route(async (req, ctx) => {
  await requireSuper();
  const user = await loadUser(ctx);
  const body = await readJson(req);
  const set = {};
  let signOut = false;

  if (body.name !== undefined) {
    const name = str(body.name, 120);
    if (!name) throw new HttpError(400, "Name can't be empty.");
    set.name = name;
  }
  if (typeof body.active === "boolean") {
    set.active = body.active;
    if (!body.active) signOut = true;
  }
  if (body.password !== undefined && body.password !== "") {
    const pw = String(body.password);
    if (pw.length < MIN_PASSWORD_LENGTH) throw new HttpError(400, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    set.passwordHash = await hashPassword(pw);
    signOut = true;
  }
  if (!Object.keys(set).length) throw new HttpError(400, "Nothing to update.");

  await User.updateOne({ _id: user._id }, { $set: set, ...(signOut ? { $inc: { tokenVersion: 1 } } : {}) });
  return NextResponse.json({ users: await listUsers() });
});

/** Delete a user. Their leads and links are kept, but become unassigned (Super Admin sees them). */
export const DELETE = route(async (_req, ctx) => {
  await requireSuper();
  const user = await loadUser(ctx);
  const id = String(user._id);
  await Promise.all([
    Lead.updateMany({ ownerId: id }, { $set: { ownerId: null } }),
    Link.updateMany({ ownerId: id }, { $set: { ownerId: null } }),
  ]);
  await User.deleteOne({ _id: user._id });
  return NextResponse.json({ users: await listUsers() });
});
