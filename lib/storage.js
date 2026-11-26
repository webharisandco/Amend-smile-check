// Patient photos live in a PRIVATE Bunny.net Storage Zone.
// The browser never talks to Bunny directly: photos are shown through
// /api/photos with a short-lived signed link this server creates, so nobody
// can browse or guess their way to them. (Don't connect the storage zone to a
// public Pull Zone — that would make every photo public.)
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const FOLDER = (process.env.BUNNY_STORAGE_FOLDER || "amend-smile-check").replace(/^\/+|\/+$/g, "");
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const DATA_URL_RE = /^data:(image\/(jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const SAFE_PATH_RE = /^[a-z0-9-]+(\/[a-zA-Z0-9_-]+)*\.(jpg|png|webp)$/;
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function config() {
  const zone = process.env.BUNNY_STORAGE_ZONE;
  const key = process.env.BUNNY_STORAGE_API_KEY;
  if (!zone || !key) {
    throw new Error("Bunny Storage is not configured. Set BUNNY_STORAGE_ZONE and BUNNY_STORAGE_API_KEY (see .env.example).");
  }
  // Falkenstein = storage.bunnycdn.com; other regions are prefixed (e.g. sg.storage.bunnycdn.com).
  const host = (process.env.BUNNY_STORAGE_HOST || "storage.bunnycdn.com").replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return { zone, key, host };
}

function objectUrl(path) {
  const { zone, host } = config();
  return `https://${host}/${encodeURIComponent(zone)}/${path.split("/").map(encodeURIComponent).join("/")}`;
}

export function storageConfigured() {
  return Boolean(process.env.BUNNY_STORAGE_ZONE && process.env.BUNNY_STORAGE_API_KEY);
}
export const storageFolder = FOLDER;
export const storageZoneName = process.env.BUNNY_STORAGE_ZONE || "";

/** Throws a friendly error unless `dataUrl` is a reasonably sized JPEG/PNG/WebP data URL. */
export function assertPhotoDataUrl(dataUrl) {
  const m = typeof dataUrl === "string" && DATA_URL_RE.exec(dataUrl);
  if (!m) throw new Error("Invalid photo. Please upload a JPG or PNG photo.");
  if ((m[3].length * 3) / 4 > MAX_PHOTO_BYTES) throw new Error("A photo is too large. Please use a smaller photo.");
  return m;
}

/** Uploads a data-URL photo to Bunny Storage. Returns its storage path. */
export async function uploadPhoto(dataUrl, name) {
  const m = assertPhotoDataUrl(dataUrl);
  const ext = m[2] === "jpeg" ? "jpg" : m[2];
  const path = `${FOLDER}/photos/${name}.${ext}`;
  const bytes = Buffer.from(m[3], "base64");
  const res = await fetch(objectUrl(path), {
    method: "PUT",
    headers: {
      AccessKey: config().key,
      "Content-Type": "application/octet-stream",
      Checksum: createHash("sha256").update(bytes).digest("hex").toUpperCase(),
    },
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status !== 201 && !res.ok) {
    throw new Error(`Photo upload to Bunny failed (HTTP ${res.status}). Check the storage zone name, password and region.`);
  }
  return path;
}

/** Downloads one photo from Bunny Storage (server side). Returns the fetch Response. */
export async function fetchPhoto(path) {
  return fetch(objectUrl(path), {
    headers: { AccessKey: config().key },
    signal: AbortSignal.timeout(20_000),
  });
}

export async function deletePhotos(paths) {
  const list = (paths || []).filter((p) => p && SAFE_PATH_RE.test(p));
  await Promise.all(
    list.map(async (p) => {
      const res = await fetch(objectUrl(p), {
        method: "DELETE",
        headers: { AccessKey: config().key },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok && res.status !== 404) throw new Error(`Couldn't delete a photo from Bunny (HTTP ${res.status}).`);
    })
  );
}

// ── Signed, expiring photo links (served by app/api/photos/route.js) ──────

function signingKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET is missing or too short (needs 32+ characters).");
  return secret;
}
const sign = (path, exp) => createHmac("sha256", signingKey()).update(`photo:${path}:${exp}`).digest("base64url");

/** A link to view one private photo, valid for about 7 days. */
export function signedPhotoUrl(path) {
  if (!path) return "";
  // Rounded to the next day so the same link is reused for a day (lets the browser cache it).
  const exp = Math.ceil((Date.now() + LINK_TTL_MS) / DAY_MS) * DAY_MS;
  return `/api/photos?p=${encodeURIComponent(path)}&e=${exp}&s=${sign(path, exp)}`;
}

/** True if the link's path, expiry and signature are all valid. */
export function verifyPhotoLink(path, exp, sig) {
  if (!path || !SAFE_PATH_RE.test(path) || !path.startsWith(`${FOLDER}/photos/`)) return false;
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Date.now()) return false;
  const expected = Buffer.from(sign(path, e));
  const given = Buffer.from(String(sig || ""));
  return given.length === expected.length && timingSafeEqual(given, expected);
}
