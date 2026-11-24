// Small helpers for API route handlers.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "./auth.js";

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
      return NextResponse.json({ error: err.message || "Something went wrong.", code: err.code }, { status });
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

/** Second line of defence behind middleware.js — every admin route calls this. */
export async function requireAdmin() {
  const store = await cookies();
  const session = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!session) throw new HttpError(401, "Not authorized. Please log in again.");
  return session;
}

export const str = (v, max = 200) => String(v == null ? "" : v).trim().slice(0, max);
