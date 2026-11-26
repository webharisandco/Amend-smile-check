import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { requireSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The signed-in person: { role: "super" | "user", name, email, userId }. */
export const GET = route(async () => {
  const s = await requireSession();
  return NextResponse.json({ me: s });
});
