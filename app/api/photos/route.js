import { NextResponse } from "next/server";
import { verifyPhotoLink, fetchPhoto } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** Streams one private photo from Bunny Storage — only with a valid signed link. */
export async function GET(req) {
  const q = req.nextUrl.searchParams;
  const path = q.get("p") || "";
  if (!verifyPhotoLink(path, q.get("e"), q.get("s"))) {
    return NextResponse.json({ error: "This photo link is invalid or has expired." }, { status: 403 });
  }
  try {
    const res = await fetchPhoto(path);
    if (res.status === 404) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
    if (!res.ok || !res.body) throw new Error(`Bunny returned HTTP ${res.status}`);
    return new Response(res.body, {
      headers: {
        "Content-Type": TYPES[path.split(".").pop()] || "application/octet-stream",
        "Cache-Control": "private, max-age=86400",
        "X-Robots-Tag": "noindex",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (err) {
    console.error("[photos]", err);
    return NextResponse.json({ error: "Couldn't load this photo." }, { status: 502 });
  }
}
