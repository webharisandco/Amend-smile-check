import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { Lead } from "@/lib/models";
import { serializeLead, userNameMap } from "@/lib/data";
import { requireSession, ownerScope } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Leads newest first — all of them for the Super Admin, only their own for a team user. */
export const GET = route(async () => {
  const s = await requireSession();
  await connectDb();
  const [docs, names] = await Promise.all([
    Lead.find(ownerScope(s), { analysisToken: 0 }).sort({ createdAt: -1 }).lean(),
    userNameMap(),
  ]);
  return NextResponse.json({
    leads: docs.map((d) => serializeLead(d, { withPhotos: false, ownerName: names[d.ownerId] })),
  });
});
