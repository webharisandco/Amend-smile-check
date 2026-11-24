// Pure scoring logic (no database, no network) — ported 1:1 from the old
// Apps Script backend so scores stay comparable with earlier leads.

export const CATEGORY_WEIGHTS = {
  alignment: 0.15,
  decayCavities: 0.3,
  gumHealth: 0.25,
  enamelWear: 0.15,
  stainingColor: 0.15,
};

export function computeOralHealthScore(analysis) {
  const c = (analysis && analysis.categories) || {};
  const get = (k) => (c[k] && typeof c[k].score === "number" ? c[k].score : 50);
  const raw =
    get("alignment") * CATEGORY_WEIGHTS.alignment +
    get("decayCavities") * CATEGORY_WEIGHTS.decayCavities +
    get("gumHealth") * CATEGORY_WEIGHTS.gumHealth +
    get("enamelWear") * CATEGORY_WEIGHTS.enamelWear +
    get("stainingColor") * CATEGORY_WEIGHTS.stainingColor;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

const SEVERITY_PENALTY = { none: 0, mild: 8, moderate: 18, severe: 30 };

/** selfReportedRiskPoints comes from computeSelfReportedRisk() — real
 * symptoms/habits the visitor told us about, not visible in a photo. */
export function computeRiskScore(analysis, selfReportedRiskPoints, hasContactInfo) {
  const c = (analysis && analysis.categories) || {};
  const sev = (k) =>
    c[k] && Object.prototype.hasOwnProperty.call(SEVERITY_PENALTY, c[k].severity) ? SEVERITY_PENALTY[c[k].severity] : 0;
  let score =
    sev("decayCavities") * 1.2 +
    sev("gumHealth") * 1.1 +
    sev("alignment") * 0.7 +
    sev("enamelWear") * 0.8 +
    sev("stainingColor") * 0.4;

  if (analysis.rootCanalRiskFlag) score += 25;
  // A genuine, visible aligner candidate is a real product-fit lead for the
  // clinic even when their general oral health score is otherwise fine.
  if (analysis.alignmentDetail && analysis.alignmentDetail.alignerCandidate) score += 20;
  score += selfReportedRiskPoints || 0;
  if (hasContactInfo) score += 5;

  return Math.round(Math.max(0, Math.min(100, score)));
}

export function classifyTemperature(riskScore) {
  if (riskScore >= 55) return "hot";
  if (riskScore >= 28) return "warm";
  return "cold";
}

/** Points added to the risk score from self-reported symptoms / habits —
 * NOT from history questions (a past, already-treated root canal isn't an
 * active risk). Keyed by category so it keeps working if an admin edits the
 * question wording. */
export const SELF_REPORT_RISK_MAP = {
  gum_bleeding: { Never: 0, Sometimes: 8, Often: 18 },
  tooth_pain: {
    "No pain": 0,
    "Mild sensitivity to hot or cold": 6,
    "Occasional pain": 14,
    "Frequent or severe pain": 26,
  },
  tooth_color: {
    "Bright white": 0,
    "Slightly yellow": 3,
    "Noticeably yellow or stained": 8,
    "Brown or dark stains": 14,
  },
  brushing_freq: { "Twice a day": 0, "Once a day": 3, "A few times a week": 10, Rarely: 16 },
  flossing: { Yes: 0, No: 6 },
  smoking: { Yes: 15, No: 0 },
  dental_visits: { "Every 6 months": 0, "Once a year": 4, Rarely: 10, Never: 15 },
};

export function computeSelfReportedRisk(questions, answers) {
  const byId = {};
  questions.forEach((q) => (byId[q.id] = q));
  let total = 0;
  (answers || []).forEach((a) => {
    const q = byId[a.questionId];
    if (!q) return;
    const map = SELF_REPORT_RISK_MAP[q.category];
    if (map && Object.prototype.hasOwnProperty.call(map, a.value)) total += map[a.value];
  });
  return total;
}
