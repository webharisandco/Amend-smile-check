// Not part of the deliverable — a throwaway harness to sanity-check the
// pure logic in Code.gs (scoring, assessment grading/skip-logic, token signing, row <-> object
// round-trips) without needing a live Apps Script deployment.
const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const code = fs.readFileSync(__dirname + "/../apps-script/Code.gs", "utf8");

// --- minimal mocks of the Apps Script services we touch ---
const propStore = {};
const cacheStore = {};
const sandbox = {
  console,
  Utilities: {
    getUuid: () => "uuid-" + Math.random().toString(36).slice(2),
    computeHmacSha256Signature: (data, key) => {
      const crypto = require("crypto");
      return Array.from(crypto.createHmac("sha256", key).update(String(data)).digest());
    },
    base64Encode: (bytes) => Buffer.from(bytes).toString("base64"),
    base64EncodeWebSafe: (input) => {
      const buf = typeof input === "string" ? Buffer.from(input) : Buffer.from(input);
      return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    },
    base64DecodeWebSafe: (str) => {
      const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
      return Buffer.from(b64, "base64");
    },
    base64Decode: (str) => Array.from(Buffer.from(str, "base64")),
    newBlob: (bytes) => ({
      getDataAsString: () => Buffer.from(bytes).toString("utf8"),
    }),
  },
  PropertiesService: {
    getScriptProperties: () => ({
      getProperty: (k) => (propStore[k] !== undefined ? propStore[k] : null),
      setProperty: (k, v) => { propStore[k] = v; },
    }),
  },
  CacheService: {
    getScriptCache: () => ({
      put: (k, v) => { cacheStore[k] = v; },
      get: (k) => (cacheStore[k] !== undefined ? cacheStore[k] : null),
      remove: (k) => { delete cacheStore[k]; },
    }),
  },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  ContentService: {
    MimeType: { JSON: "JSON" },
    createTextOutput: (s) => ({ setMimeType: () => s }),
  },
  DriveApp: {},
  SpreadsheetApp: {},
  UrlFetchApp: {},
};
sandbox.global = sandbox;

vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: "Code.gs" });

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok -", name);
  } catch (err) {
    console.error("  FAIL -", name, "\n     ", err.message);
    process.exitCode = 1;
  }
}

console.log("Password hashing:");
check("hash + verify round-trip", () => {
  const hash = sandbox.hashPassword("changeme123");
  assert.ok(sandbox.verifyPassword("changeme123", hash));
  assert.ok(!sandbox.verifyPassword("wrongpass", hash));
});

console.log("Token signing:");
check("sign + verify round-trip", () => {
  sandbox.getSettings(); // seeds tokenSecret
  const token = sandbox.signToken("admin", Date.now() + 10000);
  const data = sandbox.verifyToken(token);
  assert.strictEqual(data.u, "admin");
});
check("expired token rejected", () => {
  const token = sandbox.signToken("admin", Date.now() - 1000);
  assert.strictEqual(sandbox.verifyToken(token), null);
});
check("tampered token rejected", () => {
  const token = sandbox.signToken("admin", Date.now() + 10000);
  const tampered = token.slice(0, -2) + "xx";
  assert.strictEqual(sandbox.verifyToken(tampered), null);
});

console.log("Assessment questions:");
check("seedQuestions returns questions with age first", () => {
  const qs = sandbox.seedQuestions();
  assert.ok(qs.length >= 10);
  assert.strictEqual(qs[0].id, "age");
  assert.strictEqual(qs[0].type, "number");
});
check("questionToRow / rowToQuestion round-trip (with dependsOn)", () => {
  const qs = sandbox.seedQuestions();
  const dependent = qs.find((q) => q.id === "root_canal_detail");
  assert.ok(dependent);
  assert.strictEqual(dependent.dependsOnId, "root_canal");
  const row = sandbox.questionToRow(dependent);
  const back = sandbox.rowToQuestion(row);
  assert.strictEqual(back.dependsOnId, "root_canal");
  assert.strictEqual(back.dependsOnValue, "Yes");
  assert.strictEqual(back.type, "text");
});
check("single_choice options round-trip through JSON column", () => {
  const q = sandbox.seedQuestions().find((x) => x.id === "gum_bleeding");
  const row = sandbox.questionToRow(q);
  const back = sandbox.rowToQuestion(row);
  // Array.from: back.options was built inside the vm sandbox's separate
  // realm, so it has a different Array prototype reference than this
  // file's array literal even with identical contents — normalize both
  // through the outer realm before comparing.
  assert.deepStrictEqual(Array.from(back.options), ["Never", "Sometimes", "Often"]);
});
check("getPublicQuestions returns all active questions, unshuffled sample", () => {
  const qs = sandbox.seedQuestions();
  sandbox.getAllQuestions = () => qs;
  const pub = sandbox.getPublicQuestions();
  assert.strictEqual(pub.length, qs.filter((q) => q.active).length);
});
check("buildAnswersSummary renders readable lines and skips blanks", () => {
  const qs = sandbox.seedQuestions();
  const answers = [
    { questionId: "age", value: "29" },
    { questionId: "gum_bleeding", value: "Often" },
    { questionId: "allergies", value: "" }, // blank, should be skipped
  ];
  const summary = sandbox.buildAnswersSummary(qs, answers);
  assert.ok(summary.includes("What is your age? — 29"));
  assert.ok(summary.includes("Do your gums bleed when you brush or floss? — Often"));
  assert.ok(!summary.includes("allergies"));
});
check("computeSelfReportedRisk sums known risk categories", () => {
  const qs = sandbox.seedQuestions();
  const answers = [
    { questionId: "gum_bleeding", value: "Often" },   // 18
    { questionId: "tooth_pain", value: "Occasional pain" }, // 14
    { questionId: "smoking", value: "Yes" },          // 15
  ];
  const risk = sandbox.computeSelfReportedRisk(qs, answers);
  assert.strictEqual(risk, 18 + 14 + 15);
});
check("computeSelfReportedRisk ignores history-only categories (root canal / ortho)", () => {
  const qs = sandbox.seedQuestions();
  const answers = [
    { questionId: "root_canal", value: "Yes" },
    { questionId: "ortho", value: "Yes" },
  ];
  const risk = sandbox.computeSelfReportedRisk(qs, answers);
  assert.strictEqual(risk, 0);
});

console.log("Scoring:");
const sampleAnalysis = {
  categories: {
    alignment: { score: 70, severity: "mild" },
    decayCavities: { score: 55, severity: "moderate" },
    gumHealth: { score: 60, severity: "mild" },
    enamelWear: { score: 75, severity: "mild" },
    stainingColor: { score: 50, severity: "moderate" },
  },
  rootCanalRiskFlag: false,
};
check("computeOralHealthScore is a weighted average in range", () => {
  const score = sandbox.computeOralHealthScore(sampleAnalysis);
  assert.ok(score >= 0 && score <= 100);
  assert.strictEqual(score, 61); // hand-computed: 70*.15+55*.3+60*.25+75*.15+50*.15=60.75→61
});
check("computeRiskScore + classifyTemperature", () => {
  const risk = sandbox.computeRiskScore(sampleAnalysis, 20, true);
  assert.ok(risk >= 0 && risk <= 100);
  const temp = sandbox.classifyTemperature(risk);
  assert.ok(["hot", "warm", "cold"].includes(temp));
});
check("root canal flag meaningfully raises risk score", () => {
  const without = sandbox.computeRiskScore(sampleAnalysis, 0, false);
  const withFlag = sandbox.computeRiskScore(
    Object.assign({}, sampleAnalysis, { rootCanalRiskFlag: true }),
    0,
    false
  );
  assert.ok(withFlag > without);
});
check("higher self-reported risk points raise the score", () => {
  const low = sandbox.computeRiskScore(sampleAnalysis, 0, false);
  const high = sandbox.computeRiskScore(sampleAnalysis, 40, false);
  assert.ok(high > low);
});
check("a genuine aligner candidate raises the risk score (real sales lead)", () => {
  const notCandidate = sandbox.computeRiskScore(sampleAnalysis, 0, false);
  const candidate = sandbox.computeRiskScore(
    Object.assign({}, sampleAnalysis, {
      alignmentDetail: { crowdingZones: ["lower-front"], spacingZones: [], biteNote: "", alignerCandidate: true, alignerNote: "x" },
    }),
    0,
    false
  );
  assert.ok(candidate > notCandidate);
});
check("no alignmentDetail on the analysis doesn't crash scoring (older leads)", () => {
  const { alignmentDetail, ...withoutDetail } = Object.assign({}, sampleAnalysis);
  const score = sandbox.computeRiskScore(withoutDetail, 0, false);
  assert.ok(score >= 0 && score <= 100);
});

console.log("Leads:");
check("leadToRow / rowToLead round-trip", () => {
  const lead = {
    leadId: "abc123",
    timestamp: "2026-09-21T00:00:00.000Z",
    name: "Jane Test",
    phone: "+91123",
    email: "jane@test.com",
    refSource: "insta",
    photoUrls: ["url1", "url2", "url3"],
    oralHealthScore: 62,
    analysis: sampleAnalysis,
    assessmentAnswers: [
      { questionId: "age", value: "29" },
      { questionId: "gum_bleeding", value: "Often" },
    ],
    riskScore: 56,
    temperature: "hot",
    status: "new",
    notes: "",
  };
  const row = sandbox.leadToRow(lead);
  const back = sandbox.rowToLead(row);
  assert.strictEqual(back.leadId, "abc123");
  assert.strictEqual(back.name, "Jane Test");
  assert.strictEqual(back.oralHealthScore, 62);
  assert.strictEqual(back.temperature, "hot");
  assert.strictEqual(back.analysis.categories.alignment.score, 70);
  assert.strictEqual(back.assessmentAnswers[0].questionId, "age");
  assert.strictEqual(back.assessmentAnswers[0].value, "29");
  assert.strictEqual(back.assessmentAnswers[1].value, "Often");
});

console.log("Retry safety (runOnce):");
check("same key runs the work only once and returns the same result", () => {
  let calls = 0;
  const fn = () => { calls++; return { leadId: "abc" + calls }; };
  const a = sandbox.runOnce("submit_tok1", 60, fn);
  const b = sandbox.runOnce("submit_tok1", 60, fn);
  assert.strictEqual(calls, 1);
  assert.strictEqual(a.leadId, "abc1");
  assert.strictEqual(b.leadId, "abc1");
});
check("different keys run independently", () => {
  let calls = 0;
  const fn = () => ({ n: ++calls });
  sandbox.runOnce("k_a", 60, fn); sandbox.runOnce("k_b", 60, fn);
  assert.strictEqual(calls, 2);
});
check("an error result is not cached, so a retry can succeed", () => {
  let calls = 0;
  const fn = () => (++calls === 1 ? { error: "temporary" } : { ok: true });
  const first = sandbox.runOnce("k_err", 60, fn);
  const second = sandbox.runOnce("k_err", 60, fn);
  assert.strictEqual(first.error, "temporary");
  assert.strictEqual(second.ok, true);
});
check("a thrown error clears the in-flight marker", () => {
  assert.throws(() => sandbox.runOnce("k_throw", 60, () => { throw new Error("boom"); }));
  const r = sandbox.runOnce("k_throw", 60, () => ({ ok: 1 }));
  assert.strictEqual(r.ok, 1);
});

console.log(`\n${passed} checks passed.`);
