import { NextResponse } from "next/server";
import { route, requireAdmin, readJson, HttpError } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { Lead, LEAD_STATUSES } from "@/lib/models";
import { serializeLead, findLead } from "@/lib/data";
import { deletePhotos } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function loadLead(ctx) {
  const { id } = await ctx.params;
  const doc = await findLead(id);
  if (!doc) throw new HttpError(404, "Lead not found.");
  return doc;
}

export const GET = route(async (_req, ctx) => {
  await requireAdmin();
  const doc = await loadLead(ctx);
  return NextResponse.json({ lead: serializeLead(doc) });
});

/** Update stage and/or notes. */
export const PATCH = route(async (req, ctx) => {
  await requireAdmin();
  const doc = await loadLead(ctx);
  const body = await readJson(req);
  const set = {};
  if (typeof body.status === "string") {
    if (!LEAD_STATUSES.includes(body.status)) throw new HttpError(400, "Unknown stage.");
    set.status = body.status;
  }
  if (typeof body.notes === "string") set.notes = body.notes.slice(0, 5000);
  if (!Object.keys(set).length) throw new HttpError(400, "Nothing to update.");
  await connectDb();
  await Lead.updateOne({ _id: doc._id }, { $set: set });
  return NextResponse.json({ ok: true });
});

/** Permanently deletes the lead AND its photos from Bunny Storage. */
export const DELETE = route(async (_req, ctx) => {
  await requireAdmin();
  const doc = await loadLead(ctx);
  await deletePhotos((doc.photos || []).map((p) => p.path));
  await connectDb();
  await Lead.deleteOne({ _id: doc._id });
  return NextResponse.json({ ok: true });
});
