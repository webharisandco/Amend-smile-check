import { NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/auth.js";

// Guards the whole admin area. Every admin API route also re-checks the
// session itself (lib/http.js → requireAdmin), so this is not the only lock.
export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/admin/login") {
    if (session) return NextResponse.redirect(new URL("/admin", req.url));
    return NextResponse.next();
  }
  if (pathname === "/api/admin/login") return NextResponse.next();
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not authorized. Please log in again." }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/admin/login", req.url));
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};
