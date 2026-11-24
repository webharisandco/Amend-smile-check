// Browser-side helpers (imported only by client components).

// Retries flaky mobile connections: network drops, timeouts, gateway errors.
// The server makes analyze/submit safe to retry.
const RETRYABLE_STATUS = [408, 425, 429, 502, 503, 504];

function serverError(message, code, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  err.fromServer = true;
  return err;
}

/**
 * fetch() wrapper: JSON in/out, timeout, automatic retries, and a redirect to
 * the admin login if an admin call comes back 401.
 */
export async function api(path, { method = "GET", body, retries = 2, timeoutMs = 60000, onRetry } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      if (onRetry) onRetry(attempt);
      await new Promise((r) => setTimeout(r, Math.min(1500 * 2 ** (attempt - 1), 8000)));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(path, {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
        credentials: "same-origin",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      let data = null;
      try {
        data = await res.json();
      } catch {
        /* not JSON — e.g. a proxy error page */
      }
      if (res.status === 401 && path.startsWith("/api/admin/") && path !== "/api/admin/login") {
        window.location.href = "/admin/login";
        throw serverError("Not signed in.", "unauthorized", 401);
      }
      if (data && data.error) throw serverError(data.error, data.code, res.status); // real app error — don't retry
      if (!res.ok) {
        lastErr = serverError(`Connection problem (HTTP ${res.status}). Please check your internet and try again.`, null, res.status);
        if (RETRYABLE_STATUS.includes(res.status)) continue;
        throw lastErr;
      }
      if (data === null) {
        lastErr = new Error("Unexpected response from server.");
        continue;
      }
      return data;
    } catch (err) {
      clearTimeout(timer);
      if (err.fromServer) throw err;
      lastErr =
        err.name === "AbortError"
          ? new Error("This is taking longer than usual. Please check your connection and try again.")
          : new Error("Couldn't reach the server. Please check your internet and try again.");
    }
  }
  throw lastErr;
}

// ── Photo preparation: HEIC → JPEG, then resize (keeps uploads small & fast) ──

function isHeic(file) {
  const t = (file.type || "").toLowerCase();
  const n = (file.name || "").toLowerCase();
  return t.includes("heic") || t.includes("heif") || n.endsWith(".heic") || n.endsWith(".heif");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode"));
    img.src = src;
  });
}

/** Returns a JPEG data URL (max 1024px) from any photo, including iPhone HEIC. */
export async function resizeImageFile(file, maxDim = 1024, quality = 0.8) {
  let blob = file;
  let img;
  const tryDecode = async (b) => {
    const url = URL.createObjectURL(b);
    try {
      return await loadImage(url);
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  try {
    img = await tryDecode(blob); // Safari decodes HEIC natively
  } catch {
    if (!isHeic(file)) throw new Error("This photo format isn't supported. Please use a JPG or PNG photo.");
    try {
      const heic2any = (await import("heic2any")).default;
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
      blob = Array.isArray(converted) ? converted[0] : converted;
      img = await tryDecode(blob);
    } catch {
      throw new Error("We couldn't read this iPhone (HEIC) photo. Please try another photo or a screenshot of it.");
    }
  }
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function newRequestId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}
