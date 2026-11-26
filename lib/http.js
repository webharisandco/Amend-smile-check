// Small helpers for API route handlers.
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "./auth.js";

export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Wraps a route handler: any thrown error becomes `{ error }` JSON with a sensible status. */
export function route(fn) {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error("[api]", req.method, req.nextUrl?.pathname, err);
      const res = NextResponse.json({ error: err.message || "Something went wrong.", code: err.code }, { status });
      // A rejected session (old cookie, deactivated user, changed Super Admin password) is
      // cleared here, so the login page doesn't bounce the browser back to /admin in a loop.
      if (status === 401) res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }
  };
}

export async function readJson(req) {
  try {
    return (await req.json()) || {};
  } catch {
    throw new HttpError(400, "Invalid request body.");
  }
}

export const str = (v, max = 200) => String(v == null ? "" : v).trim().slice(0, max);
