// ─────────────────────────────────────────────────────────────────────────
// Talks to the Apps Script backend. See the big comment at the top of
// apps-script/Code.gs for why Content-Type is text/plain here — don't
// change it to application/json, it will break with a CORS error.
// ─────────────────────────────────────────────────────────────────────────

// Retries on flaky mobile connections: network drops, timeouts, and the
// transient 404/429/5xx responses Google's redirect hop sometimes returns.
// The backend makes analyze/submit safe to retry (see runOnce in Code.gs).
const RETRYABLE_STATUS = [404, 408, 425, 429, 500, 502, 503, 504];

async function callApi(action, payload, opts) {
  opts = opts || {};
  const retries = opts.retries != null ? opts.retries : 3;
  const timeoutMs = opts.timeoutMs || 60000;
  const url = window.APP_CONFIG.API_URL;
  if (!url || url.indexOf("PASTE_YOUR") === 0) {
    throw new Error("This site isn't connected to its backend yet — set API_URL in assets/js/config.js");
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      if (opts.onRetry) opts.onRetry(attempt);
      await new Promise((r) => setTimeout(r, Math.min(1500 * Math.pow(2, attempt - 1), 8000)));
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, payload: payload || {} }),
        redirect: "follow",
        credentials: "omit",
        cache: "no-store",
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        lastErr = new Error("Connection problem (HTTP " + res.status + "). Please check your internet and try again.");
        if (RETRYABLE_STATUS.includes(res.status)) continue;
        throw lastErr;
      }
      let data;
      try { data = await res.json(); } catch (e) { lastErr = new Error("Unexpected response from server."); continue; }
      if (data && data.error) {
        const err = new Error(data.error);
        err.code = data.code;
        err.fromServer = true;
        throw err;
      }
      return data;
    } catch (err) {
      clearTimeout(timer);
      if (err.fromServer) throw err; // real app error — don't retry
      lastErr = err.name === "AbortError"
        ? new Error("This is taking longer than usual. Please check your connection and try again.")
        : (err.message && err.message.indexOf("Connection problem") === 0 ? err : new Error("Couldn't reach the server. Please check your internet and try again."));
    }
  }
  throw lastErr;
}

// ---- admin session (a signed token from Code.gs, kept in localStorage) ----

const AUTH_KEY = "dental_admin_token";

function getAdminToken() {
  return localStorage.getItem(AUTH_KEY);
}
function setAdminToken(token) {
  localStorage.setItem(AUTH_KEY, token);
}
function clearAdminToken() {
  localStorage.removeItem(AUTH_KEY);
}

/** Same as callApi but auto-attaches the admin token and bounces to login on 401. */
async function callAdminApi(action, payload) {
  const token = getAdminToken();
  if (!token) {
    window.location.href = "admin-login.html";
    throw new Error("Not signed in.");
  }
  try {
    return await callApi(action, Object.assign({}, payload, { token: token }));
  } catch (err) {
    if (/not authorized/i.test(err.message)) {
      clearAdminToken();
      window.location.href = "admin-login.html";
    }
    throw err;
  }
}

// ---- photo preparation: HEIC → JPEG, then resize (keeps uploads small & fast) ----

function isHeic(file) {
  const t = (file.type || "").toLowerCase();
  const n = (file.name || "").toLowerCase();
  return t.includes("heic") || t.includes("heif") || n.endsWith(".heic") || n.endsWith(".heif");
}

let _heicLibPromise = null;
function loadHeicLib() {
  if (window.heic2any) return Promise.resolve(window.heic2any);
  if (!_heicLibPromise) {
    _heicLibPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
      s.onload = () => resolve(window.heic2any);
      s.onerror = () => { _heicLibPromise = null; reject(new Error("Couldn't load the HEIC converter.")); };
      document.head.appendChild(s);
    });
  }
  return _heicLibPromise;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode"));
    img.src = src;
  });
}

/** Returns a JPEG data URL (max 1024px, ~150KB) from any photo, including iPhone HEIC. */
async function resizeImageFile(file, maxDim = 1024, quality = 0.8) {
  let blob = file;
  let img;
  const tryDecode = async (b) => {
    const url = URL.createObjectURL(b);
    try { return await loadImage(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  };
  try {
    img = await tryDecode(blob);          // Safari decodes HEIC natively
  } catch (e) {
    if (!isHeic(file)) throw new Error("This photo format isn't supported. Please use a JPG or PNG photo.");
    try {
      const heic2any = await loadHeicLib();
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
      blob = Array.isArray(converted) ? converted[0] : converted;
      img = await tryDecode(blob);
    } catch (e2) {
      throw new Error("We couldn't read this iPhone (HEIC) photo. Please try another photo or a screenshot of it.");
    }
  }
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
    else { width = Math.round((width * maxDim) / height); height = maxDim; }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function newRequestId() {
  return (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch (e) {
    return iso;
  }
}

// Older leads stored Drive links as uc?export=view&id=... which often won't
// render in <img>; the lh3 form embeds reliably.
function normalizePhotoUrl(url) {
  if (!url) return url;
  const m = /[?&]id=([^&]+)/.exec(url);
  if (url.indexOf("drive.google.com") !== -1 && m) return "https://lh3.googleusercontent.com/d/" + m[1];
  return url;
}
function esc(str) {
  const d = document.createElement("div");
  d.textContent = str == null ? "" : String(str);
  return d.innerHTML;
}
function cfg(key, fallback) {
  return (window.APP_CONFIG && window.APP_CONFIG[key]) || fallback;
}
