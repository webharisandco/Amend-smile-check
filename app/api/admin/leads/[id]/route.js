import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { route, readJson, HttpError } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { Lead, LEAD_STATUSES, User } from "@/lib/models";
import { serializeLead, findLead, userNameMap } from "@/lib/data";
import { deletePhotos } from "@/lib/storage";
import { requireSession, ownerScope } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Finds the lead only if this person may see it (a team user gets "not found" for others' leads). */
async function loadLead(ctx, session) {
  const { id } = await ctx.params;
  const doc = await findLead(id, ownerScope(session));
  if (!doc) throw new HttpError(404, "Lead not found.");
  return doc;
}

export const GET = route(async (_req, ctx) => {
  const s = await requireSession();
  const doc = await loadLead(ctx, s);
  const names = await userNameMap();
  return NextResponse.json({ lead: serializeLead(doc, { ownerName: names[doc.ownerId] }) });
});

/** Update stage and/or notes, or reassign it: { ownerId: userId | null }. */
export const PATCH = route(async (req, ctx) => {
  const s = await requireSession();
  const doc = await loadLead(ctx, s);
  const body = await readJson(req);
  const set = {};
  if (typeof body.status === "string") {
    if (!LEAD_STATUSES.includes(body.status)) throw new HttpError(400, "Unknown stage.");
    set.status = body.status;
  }
  if (typeof body.notes === "string") set.notes = body.notes.slice(0, 5000);
  if (body.ownerId !== undefined) {
    if (body.ownerId === null || body.ownerId === "") set.ownerId = null;
    else {
      if (!mongoose.isValidObjectId(body.ownerId) || !(await User.exists({ _id: body.ownerId }))) {
        throw new HttpError(400, "That user doesn't exist.");
      }
      set.ownerId = String(body.ownerId);
    }
  }
  if (!Object.keys(set).length) throw new HttpError(400, "Nothing to update.");
  await connectDb();
  await Lead.updateOne({ _id: doc._id }, { $set: set });
  return NextResponse.json({ ok: true });
});

/** Permanently deletes the lead AND its photos. */
export const DELETE = route(async (_req, ctx) => {
  const s = await requireSession();
  const doc = await loadLead(ctx, s);
  await deletePhotos((doc.photos || []).map((p) => p.path));
  await connectDb();
  await Lead.deleteOne({ _id: doc._id });
  return NextResponse.json({ ok: true });
});
