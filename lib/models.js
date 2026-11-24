import mongoose from "mongoose";

const { Schema } = mongoose;
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

export const LEAD_STATUSES = ["new", "contacted", "booked", "converted", "dismissed"];

// ── Leads: one per completed Smile Check ────────────────────────────────
const LeadSchema = new Schema(
  {
    leadId: { type: String, required: true, unique: true },
    analysisToken: { type: String, unique: true, sparse: true }, // makes "submit" safe to retry
    name: { type: String, default: "Anonymous" },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    refSource: { type: String, default: "direct" },
    // Cloudinary public IDs of the private ("authenticated") photos.
    photos: { type: [{ publicId: String, _id: false }], default: [] },
    oralHealthScore: { type: Number, default: 0 },
    analysis: { type: Schema.Types.Mixed, default: {} },
    assessmentAnswers: { type: [Schema.Types.Mixed], default: [] },
    riskScore: { type: Number, default: 0 },
    temperature: { type: String, enum: ["hot", "warm", "cold"], default: "cold" },
    status: { type: String, enum: LEAD_STATUSES, default: "new" },
    notes: { type: String, default: "" },
  },
  { timestamps: true, minimize: false }
);
LeadSchema.index({ createdAt: -1 });

// ── Analyses: AI results waiting for the visitor to enter their details.
// Replaces the Apps Script cache. Auto-deleted by MongoDB after 24 hours.
const AnalysisSchema = new Schema(
  {
    requestId: { type: String, required: true, unique: true }, // makes "analyze" safe to retry
    token: { type: String, unique: true, sparse: true },
    status: { type: String, enum: ["pending", "done"], default: "pending" },
    analysis: { type: Schema.Types.Mixed },
    oralHealthScore: { type: Number },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
  },
  { minimize: false }
);

// ── Assessment questions ────────────────────────────────────────────────
const QuestionSchema = new Schema({
  id: { type: String, required: true, unique: true },
  text: { type: String, required: true },
  type: { type: String, enum: ["number", "text", "yes_no", "single_choice"], default: "text" },
  options: { type: [String], default: [] },
  category: { type: String, default: "custom" },
  dependsOnId: { type: String, default: "" },
  dependsOnValue: { type: String, default: "" },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
});

// ── Trackable share links (?ref=code) ───────────────────────────────────
const LinkSchema = new Schema(
  {
    code: { type: String, required: true, unique: true },
    label: { type: String, default: "Untitled link" },
  },
  { timestamps: true }
);

// ── App settings + admin account (a single document, key = "app") ───────
const SettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    brandName: String,
    adminUsername: String,
    adminPasswordHash: String,
    openaiApiKey: { type: String, default: "" },
    openaiModel: { type: String, default: "gpt-4o" },
  },
  { timestamps: true }
);

export const Lead = model("Lead", LeadSchema);
export const Analysis = model("Analysis", AnalysisSchema);
export const Question = model("Question", QuestionSchema);
export const Link = model("Link", LinkSchema);
export const Setting = model("Setting", SettingSchema);
