import { NextResponse } from "next/server";
import { route, requireAdmin } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { Lead } from "@/lib/models";
import { serializeLead } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** All leads, newest first (photos are loaded on the individual lead page). */
export const GET = route(async () => {
  await requireAdmin();
  await connectDb();
  const docs = await Lead.find({}, { analysisToken: 0 }).sort({ createdAt: -1 }).lean();
  return NextResponse.json({ leads: docs.map((d) => serializeLead(d, { withPhotos: false })) });
});
