import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { route, requireAdmin, readJson, str } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { Link } from "@/lib/models";
import { listLinks } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireAdmin();
  return NextResponse.json({ links: await listLinks() });
});

export const POST = route(async (req) => {
  await requireAdmin();
  const body = await readJson(req);
  const code =
    str(body.code, 60)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || randomBytes(4).toString("hex");
  await connectDb();
  await Link.updateOne(
    { code },
    { $setOnInsert: { code, label: str(body.label, 120) || "Untitled link" } },
    { upsert: true }
  );
  return NextResponse.json({ links: await listLinks() });
});
