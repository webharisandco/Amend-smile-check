import { NextResponse } from "next/server";
import { route, requireAdmin } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { Link } from "@/lib/models";
import { listLinks } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const DELETE = route(async (_req, ctx) => {
  await requireAdmin();
  const { code } = await ctx.params;
  await connectDb();
  await Link.deleteOne({ code: String(code) });
  return NextResponse.json({ links: await listLinks() });
});
