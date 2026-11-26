import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { route, readJson, HttpError, str } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { Link, User } from "@/lib/models";
import { listLinks } from "@/lib/data";
import { requireSession, ownerScope } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const s = await requireSession();
  return NextResponse.json({ links: await listLinks(ownerScope(s)) });
});

/** Create a share link, optionally owned by a team user ({ ownerId }); leads that come
 * through it are assigned to that user. */
export const POST = route(async (req) => {
  const s = await requireSession();
  const body = await readJson(req);
  const code =
    str(body.code, 60)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || randomBytes(4).toString("hex");

  let ownerId = null;
  if (body.ownerId) {
    if (!mongoose.isValidObjectId(body.ownerId) || !(await User.exists({ _id: body.ownerId }))) {
      throw new HttpError(400, "That user doesn't exist.");
    }
    ownerId = String(body.ownerId);
  }

  await connectDb();
  const existing = await Link.findOne({ code }).lean();
  if (existing) throw new HttpError(409, `The code "${code}" is already used. Pick another one.`);
  await Link.create({ code, label: str(body.label, 120) || "Untitled link", ownerId });
  return NextResponse.json({ links: await listLinks(ownerScope(s)) });
});
