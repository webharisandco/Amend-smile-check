import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/auth.js";

// Guards the whole admin area. Every admin API route also re-checks the
// session and the person's role itself (lib/session.js), so this is not the only lock.
export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const payload = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  // Only current-format sessions count (older cookies had no role).
  const session = payload && (payload.role === "super" || payload.role === "user") ? payload : null;

  if (pathname === "/admin/login") {
    if (session) return NextResponse.redirect(new URL("/admin", req.url));
    return NextResponse.next();
  }
  if (pathname === "/api/admin/login") return NextResponse.next();
  if (session) return NextResponse.next();

  const res = pathname.startsWith("/api/")
    ? NextResponse.json({ error: "Not authorized. Please log in again." }, { status: 401 })
    : NextResponse.redirect(new URL("/admin/login", req.url));
  if (payload) res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 }); // drop the stale cookie
  return res;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
