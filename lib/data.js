// Server-side data helpers shared by the API routes and server pages.
import bcrypt from "bcryptjs";
import { connectDb } from "./db.js";
import { Lead, Link, Question, Setting, User } from "./models.js";
import { seedQuestions } from "./questions.js";
import { signedPhotoUrl, storageConfigured, storageFolder, storageZoneName } from "./storage.js";
import { siteConfig } from "./config.js";
import { superAdminConfig } from "./credentials.js";

// ── App settings (Super Admin only) ─────────────────────────────────────

/** The settings document, created on first use. */
export async function getSettings() {
  await connectDb();
  let s = await Setting.findOne({ key: "app" }).lean();
  if (!s) {
    try {
      await Setting.create({
        key: "app",
        brandName: siteConfig.clinicName,
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

/** What the Super Admin's settings page may see — never the raw OpenAI key. */
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
    openaiConfigured: Boolean(openaiKeyOf(s)),
    openaiKeySource: s.openaiApiKey ? "settings" : process.env.OPENAI_API_KEY ? "env" : null,
    openaiModel: s.openaiModel || "gpt-4o",
    superAdminEmail: superAdminConfig().email,
    databaseName: dbName,
    storageConfigured: storageConfigured(),
    storageZone: storageZoneName,
    storageFolder,
  };
}

export async function hashPassword(password) {
  return bcrypt.hash(String(password), 10);
}
export async function verifyPassword(password, hash) {
  return Boolean(password) && Boolean(hash) && bcrypt.compare(String(password), hash);
}

// ── Team users ──────────────────────────────────────────────────────────

export function serializeUser(u, extra = {}) {
  return {
    id: String(u._id),
    name: u.name,
    email: u.email,
    active: u.active !== false,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt || null,
    ...extra,
  };
}

/** All team users with how many leads each one has. */
export async function listUsers() {
  await connectDb();
  const [users, counts] = await Promise.all([
    User.find({}).sort({ createdAt: 1 }).lean(),
    Lead.aggregate([{ $match: { ownerId: { $ne: null } } }, { $group: { _id: "$ownerId", n: { $sum: 1 } } }]),
  ]);
  const byOwner = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  return users.map((u) => serializeUser(u, { leadCount: byOwner[String(u._id)] || 0 }));
}

/** id → name for every team user (for showing lead/link owners). */
export async function userNameMap() {
  await connectDb();
  const users = await User.find({}, { name: 1 }).lean();
  return Object.fromEntries(users.map((u) => [String(u._id), u.name]));
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

/** Links visible to this session (all for the Super Admin, own for a team user). */
export async function listLinks(filter = {}) {
  await connectDb();
  const [docs, names] = await Promise.all([Link.find(filter).sort({ createdAt: -1 }).lean(), userNameMap()]);
  return docs.map((l) => ({
    code: l.code,
    label: l.label,
    createdAt: l.createdAt,
    ownerId: l.ownerId || null,
    ownerName: l.ownerId ? names[l.ownerId] || "Deleted user" : null,
  }));
}

// ── Leads ───────────────────────────────────────────────────────────────

/** Shapes a lead for the browser. `forPatient` strips anything internal. */
export function serializeLead(doc, { forPatient = false, withPhotos = true, ownerName } = {}) {
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
    ownerId: doc.ownerId || null,
    ownerName: doc.ownerId ? ownerName || "Deleted user" : null,
    assessmentAnswers: doc.assessmentAnswers || [],
    riskScore: doc.riskScore || 0,
    temperature: doc.temperature || "cold",
    status: doc.status || "new",
    notes: doc.notes || "",
    photoCount: (doc.photos || []).length,
  };
}

export async function findLead(leadId, scope = {}) {
  if (!leadId || typeof leadId !== "string" || leadId.length > 64) return null;
  await connectDb();
  return Lead.findOne({ leadId, ...scope }).lean();
}
