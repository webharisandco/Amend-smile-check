// Patient photos live in Cloudinary as PRIVATE ("authenticated") images:
// they can only be viewed through signed URLs that this server generates,
// so nobody can browse or guess their way to them.
import { v2 as cloudinary } from "cloudinary";

const FOLDER = (process.env.CLOUDINARY_FOLDER || "amend-smile-check").replace(/^\/+|\/+$/g, "");
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

let configured = false;
function cld() {
  if (!configured) {
    if (process.env.CLOUDINARY_CLOUD_NAME) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    } else if (!process.env.CLOUDINARY_URL) {
      throw new Error("Cloudinary is not configured. Set CLOUDINARY_URL in .env.local (see .env.example).");
    }
    // (With only CLOUDINARY_URL set, the SDK reads it from the environment itself.)
    cloudinary.config({ secure: true });
    configured = true;
  }
  return cloudinary;
}

export function cloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME);
}
export const cloudinaryFolder = FOLDER;

/** Throws a friendly error unless `dataUrl` is a reasonably sized JPEG/PNG/WebP data URL. */
export function assertPhotoDataUrl(dataUrl) {
  const m = typeof dataUrl === "string" && DATA_URL_RE.exec(dataUrl);
  if (!m) throw new Error("Invalid photo. Please upload a JPG or PNG photo.");
  if ((m[2].length * 3) / 4 > MAX_PHOTO_BYTES) throw new Error("A photo is too large. Please use a smaller photo.");
}

/** Uploads a data-URL photo as a private image. Returns its public ID. */
export async function uploadPhoto(dataUrl, publicId) {
  assertPhotoDataUrl(dataUrl);
  const res = await cld().uploader.upload(dataUrl, {
    folder: `${FOLDER}/photos`,
    public_id: publicId,
    type: "authenticated",
    resource_type: "image",
    overwrite: true,
  });
  return res.public_id;
}

/** A signed URL for viewing one private photo (resized for fast loading). */
export function signedPhotoUrl(publicId) {
  if (!publicId) return "";
  return cld().url(publicId, {
    type: "authenticated",
    resource_type: "image",
    sign_url: true,
    secure: true,
    transformation: [{ width: 1400, height: 1400, crop: "limit", quality: "auto", fetch_format: "auto" }],
  });
}

export async function deletePhotos(publicIds) {
  const ids = (publicIds || []).filter(Boolean);
  if (!ids.length) return;
  await cld().api.delete_resources(ids, { type: "authenticated", resource_type: "image" });
}
