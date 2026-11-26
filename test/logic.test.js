// Run with:  npm test
// Checks the pure logic (scoring, questions, sessions) without a database.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeOralHealthScore,
  computeRiskScore,
  classifyTemperature,
  computeSelfReportedRisk,
} from "../lib/scoring.js";
import { seedQuestions, buildAnswersSummary, cleanAnswers, normalizeQuestion } from "../lib/questions.js";
import { createSessionToken, verifySessionToken } from "../lib/auth.js";
import { signedPhotoUrl, verifyPhotoLink, assertPhotoDataUrl } from "../lib/storage.js";

const cat = (score, severity) => ({ score, severity, summary: "" });
const sample = (over = {}) => ({
  categories: {
    alignment: cat(70, "mild"),
    decayCavities: cat(55, "moderate"),
    gumHealth: cat(60, "mild"),
    enamelWear: cat(75, "mild"),
    stainingColor: cat(50, "moderate"),
  },
  rootCanalRiskFlag: false,
  alignmentDetail: { alignerCandidate: false },
  ...over,
});

test("seedQuestions puts age first and wires dependencies", () => {
  const qs = seedQuestions();
  assert.equal(qs[0].id, "age");
  const detail = qs.find((q) => q.id === "root_canal_detail");
  assert.equal(detail.dependsOnId, "root_canal");
  assert.equal(detail.dependsOnValue, "Yes");
  assert.deepEqual(qs.map((q) => q.order), qs.map((_, i) => i + 1));
});

test("buildAnswersSummary renders readable lines and skips blanks", () => {
  const qs = seedQuestions();
  const s = buildAnswersSummary(qs, [
    { questionId: "age", value: "29" },
    { questionId: "gum_bleeding", value: "Often" },
    { questionId: "allergies", value: "   " },
  ]);
  assert.equal(s, "What is your age? — 29\nDo your gums bleed when you brush or floss? — Often");
});

test("cleanAnswers drops unknown questions and blanks, attaches text", () => {
  const qs = seedQuestions();
  const out = cleanAnswers(qs, [
    { questionId: "age", value: " 40 " },
    { questionId: "nope", value: "x" },
    { questionId: "smoking", value: "" },
    null,
  ]);
  assert.deepEqual(out, [{ questionId: "age", text: "What is your age?", value: "40" }]);
});

test("normalizeQuestion validates multiple-choice options", () => {
  assert.throws(() => normalizeQuestion({ id: "x", text: "Pick", type: "single_choice", options: ["only one"] }, 0));
  const q = normalizeQuestion({ id: "x", text: " Pick ", type: "single_choice", options: ["A", " ", "B"] }, 2);
  assert.deepEqual(q.options, ["A", "B"]);
  assert.equal(q.text, "Pick");
  assert.equal(q.order, 3);
  assert.deepEqual(normalizeQuestion({ id: "y", text: "Age", type: "number", options: ["junk"] }, 0).options, []);
});

test("computeSelfReportedRisk sums known categories, ignores history", () => {
  const qs = seedQuestions();
  const pts = computeSelfReportedRisk(qs, [
    { questionId: "gum_bleeding", value: "Often" }, // 18
    { questionId: "smoking", value: "Yes" }, // 15
    { questionId: "root_canal", value: "Yes" }, // history → 0
  ]);
  assert.equal(pts, 33);
});

test("computeOralHealthScore is a weighted average in range", () => {
  // 70*.15 + 55*.3 + 60*.25 + 75*.15 + 50*.15 = 60.75 → 61
  assert.equal(computeOralHealthScore(sample()), 61);
  assert.equal(computeOralHealthScore({}), 50);
});

test("risk score: root canal flag, aligner candidate and contact info raise it", () => {
  const base = computeRiskScore(sample(), 0, false);
  assert.ok(computeRiskScore(sample({ rootCanalRiskFlag: true }), 0, false) >= base + 25);
  assert.equal(computeRiskScore(sample({ alignmentDetail: { alignerCandidate: true } }), 0, false), base + 20);
  assert.equal(computeRiskScore(sample(), 0, true), base + 5);
  assert.ok(computeRiskScore(sample({ alignmentDetail: undefined }), 0, false) >= 0); // older leads don't crash
  assert.equal(computeRiskScore(sample({ rootCanalRiskFlag: true }), 500, true), 100); // clamped
});

test("classifyTemperature thresholds", () => {
  assert.equal(classifyTemperature(55), "hot");
  assert.equal(classifyTemperature(54), "warm");
  assert.equal(classifyTemperature(28), "warm");
  assert.equal(classifyTemperature(27), "cold");
});

test("photo links: valid link passes; tampered, expired or outside-folder links fail", () => {
  process.env.AUTH_SECRET = "test-secret-that-is-definitely-longer-than-32-chars";
  const path = "amend-smile-check/photos/abc123_1.jpg";
  const q = new URL(signedPhotoUrl(path), "http://x").searchParams;
  assert.equal(q.get("p"), path);
  assert.ok(verifyPhotoLink(q.get("p"), q.get("e"), q.get("s")));
  assert.ok(!verifyPhotoLink("amend-smile-check/photos/other_1.jpg", q.get("e"), q.get("s"))); // other photo
  assert.ok(!verifyPhotoLink(path, String(Number(q.get("e")) + 1), q.get("s"))); // changed expiry
  assert.ok(!verifyPhotoLink(path, String(Date.now() - 1000), q.get("s"))); // expired
  assert.ok(!verifyPhotoLink("amend-smile-check/photos/../secret.jpg", q.get("e"), q.get("s"))); // path tricks
  assert.ok(!verifyPhotoLink("other-folder/x.jpg", q.get("e"), q.get("s")));
});

test("assertPhotoDataUrl accepts images, rejects anything else", () => {
  assert.doesNotThrow(() => assertPhotoDataUrl("data:image/jpeg;base64,/9j/4AAQ"));
  assert.throws(() => assertPhotoDataUrl("data:text/html;base64,PGh0bWw+"));
  assert.throws(() => assertPhotoDataUrl("https://example.com/a.jpg"));
});

test("admin session tokens: round-trip, tamper and wrong-secret rejected", async () => {
  process.env.AUTH_SECRET = "test-secret-that-is-definitely-longer-than-32-chars";
  const token = await createSessionToken("admin");
  assert.equal((await verifySessionToken(token)).u, "admin");
  assert.equal(await verifySessionToken(token.slice(0, -2) + "xx"), null);
  assert.equal(await verifySessionToken(""), null);
  process.env.AUTH_SECRET = "a-completely-different-secret-also-over-32-chars";
  assert.equal(await verifySessionToken(token), null);
});
