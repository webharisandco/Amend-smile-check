// Server-side data helpers shared by the API routes and server pages.
import bcrypt from "bcryptjs";
import { connectDb } from "./db.js";
import { Lead, Link, Question, Setting } from "./models.js";
import { seedQuestions } from "./questions.js";
import { signedPhotoUrl, storageConfigured, storageFolder, storageZoneName } from "./storage.js";
import { siteConfig } from "./config.js";

const DEFAULT_PASSWORD = "changeme123";

// ── Settings + admin account ────────────────────────────────────────────

/** The settings document, created on first use (admin account from ADMIN_USERNAME / ADMIN_PASSWORD). */
export async function getSettings() {
  await connectDb();
  let s = await Setting.findOne({ key: "app" }).lean();
  if (!s) {
    try {
      await Setting.create({
        key: "app",
        brandName: siteConfig.clinicName,
        adminUsername: (process.env.ADMIN_USERNAME || "admin").trim(),
        adminPasswordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD, 10),
        openaiModel: process.env.OPENAI_MODEL || "gpt-4o",
      });
    } catch (err) {
      if (err.code !== 11000) throw err; // another request created it first — fine
    }
    s = await Setting.findOne({ key: "app" }).lean();
  }
  return s;
}

/** Key saved in Admin → Settings wins; otherwise the OPENAI_API_KEY env var. */
export function openaiKeyOf(settings) {
  return (settings && settings.openaiApiKey) || process.env.OPENAI_API_KEY || "";
}

/** What the admin UI may see — never the raw key or password hash. */
export async function publicSettings(s) {
  s = s || (await getSettings());
  const dbName = (() => {
    try {
      return new URL(process.env.MONGODB_URI).pathname.replace(/^\//, "") || "test";
    } catch {
      return "";
    }
  })();
  return {
    brandName: s.brandName,
    adminUsername: s.adminUsername,
    openaiConfigured: Boolean(openaiKeyOf(s)),
    openaiKeySource: s.openaiApiKey ? "settings" : process.env.OPENAI_API_KEY ? "env" : null,
    openaiModel: s.openaiModel || "gpt-4o",
    usingDefaultPassword: await bcrypt.compare(DEFAULT_PASSWORD, s.adminPasswordHash || ""),
    databaseName: dbName,
    storageConfigured: storageConfigured(),
    storageZone: storageZoneName,
    storageFolder,
  };
}

export async function verifyAdminPassword(settings, password) {
  return Boolean(password) && bcrypt.compare(String(password), settings.adminPasswordHash || "");
}
export async function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
}

// ── Questions ───────────────────────────────────────────────────────────

/** All questions in order; seeds the default set if the collection is empty. */
export async function getAllQuestions() {
  await connectDb();
  let list = await Question.find({}, { _id: 0, __v: 0 }).sort({ order: 1 }).lean();
  if (!list.length) {
    try {
      await Question.insertMany(seedQuestions(), { ordered: false });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
    list = await Question.find({}, { _id: 0, __v: 0 }).sort({ order: 1 }).lean();
  }
  return list;
}

// ── Share links ─────────────────────────────────────────────────────────

export async function listLinks() {
  await connectDb();
  const docs = await Link.find({}).sort({ createdAt: -1 }).lean();
  return docs.map((l) => ({ code: l.code, label: l.label, createdAt: l.createdAt }));
}

// ── Leads ───────────────────────────────────────────────────────────────

/** Shapes a lead for the browser. `forPatient` strips anything internal. */
export function serializeLead(doc, { forPatient = false, withPhotos = true } = {}) {
  const analysis = { ...(doc.analysis || {}) };
  const lead = {
    leadId: doc.leadId,
    timestamp: (doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt)).toISOString(),
    name: doc.name || "",
    oralHealthScore: doc.oralHealthScore || 0,
    photoUrls: withPhotos ? (doc.photos || []).map((p) => signedPhotoUrl(p.path)).filter(Boolean) : [],
    analysis,
  };
  if (forPatient) {
    delete analysis.staffNote; // internal consultation angle — staff only
    return lead;
  }
  return {
    ...lead,
    phone: doc.phone || "",
    email: doc.email || "",
    refSource: doc.refSource || "direct",
    assessmentAnswers: doc.assessmentAnswers || [],
    riskScore: doc.riskScore || 0,
    temperature: doc.temperature || "cold",
    status: doc.status || "new",
    notes: doc.notes || "",
    photoCount: (doc.photos || []).length,
  };
}

export async function findLead(leadId) {
  if (!leadId || typeof leadId !== "string" || leadId.length > 64) return null;
  await connectDb();
  return Lead.findOne({ leadId }).lean();
}
