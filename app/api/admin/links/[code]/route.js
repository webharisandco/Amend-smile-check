import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { Link } from "@/lib/models";
import { listLinks } from "@/lib/data";
import { requireSession, ownerScope } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Delete a link — a team user can only delete their own. */
export const DELETE = route(async (_req, ctx) => {
  const s = await requireSession();
  const { code } = await ctx.params;
  await connectDb();
  await Link.deleteOne({ code: String(code), ...ownerScope(s) });
  return NextResponse.json({ links: await listLinks(ownerScope(s)) });
});
