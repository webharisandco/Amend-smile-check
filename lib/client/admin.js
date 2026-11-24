// Shared admin-side helpers (browser only).
import { siteConfig } from "../config.js";
import { api } from "./api.js";

export const STATUSES = [
  { key: "new", label: "New", cls: "badge-brand" },
  { key: "contacted", label: "Contacted", cls: "badge-neutral" },
  { key: "booked", label: "Booked", cls: "badge-orange" },
  { key: "converted", label: "Converted", cls: "badge-success" },
  { key: "dismissed", label: "Dismissed", cls: "badge-danger" },
];

export const TEMP_META = {
  hot: { cls: "badge-danger", icon: "🔥", label: "Hot" },
  warm: { cls: "badge-warning", icon: "◐", label: "Warm" },
  cold: { cls: "badge-neutral", icon: "○", label: "Cold" },
};

export const isAligner = (l) => Boolean(l.analysis?.alignmentDetail?.alignerCandidate);

export function siteOrigin() {
  return typeof window !== "undefined" ? window.location.origin : "";
}

export function reportLink(lead) {
  return `${siteOrigin()}/report/${encodeURIComponent(lead.leadId)}`;
}

/** Normalises Indian numbers (10 digits → 91XXXXXXXXXX); leaves other country codes alone. */
export function waNumber(phone) {
  let d = String(phone || "").replace(/[^0-9]/g, "");
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = "91" + d;
  return d;
}

export function waLink(lead) {
  const first = (lead.name || "").trim().split(" ")[0] || "there";
  const msg =
    `Hi ${first}, this is ${siteConfig.clinicName} 👋 Thank you for taking our AI Smile Check! ` +
    `Here's your personal report: ${reportLink(lead)}\n\n` +
    `Our dentists would love to walk you through it in a free consultation. When would suit you?`;
  return `https://wa.me/${waNumber(lead.phone)}?text=${encodeURIComponent(msg)}`;
}

/** Best one-line "why call" reason for a lead. */
export function leadHook(lead) {
  const a = lead.analysis || {};
  if (a.alignmentDetail?.alignerCandidate) return "Aligner candidate";
  if (a.rootCanalRiskFlag) return "Tooth worth checking soon";
  const att = (a.attentionAreas || [])[0];
  if (att) return att.title;
  return (a.detectedIssues || [])[0] || "General check-up";
}

export function updateLead(leadId, updates) {
  return api(`/api/admin/leads/${encodeURIComponent(leadId)}`, { method: "PATCH", body: updates, retries: 1 });
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
