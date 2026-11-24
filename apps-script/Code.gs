/**
 * ORAL HEALTH AI TEST — Apps Script backend
 * ------------------------------------------------------------------
 * This ONE script is the entire backend: it reads/writes the Sheet it's
 * bound to, stores photos in a Drive folder, calls OpenAI for the vision
 * analysis (informed by a short self-reported assessment, not a trivia
 * quiz), and holds all admin settings — via PropertiesService, which is
 * Apps Script's built-in persistent key/value store (survives forever,
 * nothing to configure).
 *
 * SETUP: see README.md. Short version — create a Google Sheet, Extensions
 * → Apps Script, paste this whole file in, Deploy → New deployment → Web
 * app → Execute as "Me", Who has access "Anyone" → copy the /exec URL into
 * assets/js/config.js on the website.
 *
 * IMPORTANT (read before you "fix" this): the frontend calls this script
 * with fetch() using Content-Type: text/plain — NOT application/json. That
 * is intentional. application/json triggers a CORS preflight (an OPTIONS
 * request) that Apps Script Web Apps cannot answer, which breaks every
 * request with a CORS error. text/plain is a browser "simple request" so
 * no preflight happens, and doPost still parses it fine as JSON below.
 * Don't change the frontend's Content-Type header.
 * ------------------------------------------------------------------
 */

// ─────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────

var LEADS_SHEET = 'Leads';
var QUESTIONS_SHEET = 'Questions';
var PROPS = PropertiesService.getScriptProperties();
var SETTINGS_KEY = 'APP_SETTINGS_V1';
var LINKS_KEY = 'APP_LINKS_V1';
var DRIVE_FOLDER_KEY = 'PHOTOS_FOLDER_ID';
var TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

var LEADS_HEADER = [
  'Timestamp', 'LeadID', 'Name', 'Phone', 'Email', 'RefSource',
  'Photo1', 'Photo2', 'Photo3',
  'OralHealthScore', 'AlignmentScore', 'DecayScore', 'GumScore', 'EnamelScore', 'StainingScore',
  'RootCanalRiskFlag', 'DetectedIssuesJSON', 'RecommendedProductsJSON',
  'AssessmentAnswersJSON', 'AnalysisJSON',
  'RiskScore', 'Temperature', 'Status', 'Notes'
];
var STATUS_COL = LEADS_HEADER.indexOf('Status') + 1; // 1-based
var NOTES_COL = LEADS_HEADER.indexOf('Notes') + 1;

// Assessment question schema (this is a self-report intake form, not a
// graded quiz — there is no "correct answer").
var QUESTIONS_HEADER = [
  'ID', 'Text', 'Type', 'OptionsJSON', 'Category',
  'DependsOnID', 'DependsOnValue', 'Active', 'Order'
];

// ─────────────────────────────────────────────────────────────────────────
// HTTP entry points
// ─────────────────────────────────────────────────────────────────────────

function doGet(e) {
  return jsonOut({ ok: true, message: 'Oral Health AI backend is running.' });
}

function doPost(e) {
  var body = {};
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonOut({ error: 'Invalid request body.' });
  }

  var action = body.action;
  var payload = body.payload || {};

  try {
    switch (action) {
      case 'ping':
        return jsonOut({ ok: true });

      // ---- public ----
      case 'getPublicQuestions':
        return jsonOut({ questions: getPublicQuestions() });
      case 'getBrand':
        return jsonOut({ brandName: getSettings().brandName });
      case 'analyze':
        return jsonOut(analyzePhotos(payload));
      case 'submit':
        return jsonOut(submitLead(payload));
      case 'getReport':
        return jsonOut({ lead: getLeadById(payload.leadId) });

      // ---- admin (all require a valid token) ----
      case 'adminLogin':
        return jsonOut(adminLogin(payload.username, payload.password));
      case 'adminMe':
        return jsonOut(requireAdmin(payload.token));
      case 'getLeads':
        requireAdmin(payload.token);
        return jsonOut({ leads: getAllLeads() });
      case 'updateLead':
        requireAdmin(payload.token);
        updateLead(payload.leadId, payload.updates);
        return jsonOut({ ok: true });
      case 'getAdminQuestions':
        requireAdmin(payload.token);
        return jsonOut({ questions: getAllQuestions() });
      case 'saveQuestions':
        requireAdmin(payload.token);
        saveQuestions(payload.questions);
        return jsonOut({ ok: true });
      case 'getSettings':
        requireAdmin(payload.token);
        return jsonOut({ settings: publicSettings() });
      case 'saveSettings':
        requireAdmin(payload.token);
        return jsonOut({ settings: saveSettings(payload) });
      case 'testOpenAIKey':
        requireAdmin(payload.token);
        return jsonOut(testOpenAIKey(payload.openaiApiKey || getSettings().openaiApiKey));
      case 'getLinks':
        requireAdmin(payload.token);
        return jsonOut({ links: getLinks() });
      case 'saveLink':
        requireAdmin(payload.token);
        return jsonOut({ links: addLink(payload.label, payload.code) });
      case 'deleteLink':
        requireAdmin(payload.token);
        return jsonOut({ links: removeLink(payload.code) });
      case 'changeAdminAccount':
        requireAdmin(payload.token);
        return jsonOut(changeAdminAccount(payload));

      default:
        return jsonOut({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonOut({ error: String(err && err.message ? err.message : err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────────
// Settings (PropertiesService = the tiny "config store")
// ─────────────────────────────────────────────────────────────────────────

function getSettings() {
  var raw = PROPS.getProperty(SETTINGS_KEY);
  if (raw) return JSON.parse(raw);

  // First run: seed defaults (admin/changeme123) and persist.
  var defaults = {
    brandName: 'Your Dental Clinic',
    adminUsername: 'admin',
    adminPasswordHash: hashPassword('changeme123'),
    tokenSecret: Utilities.getUuid() + Utilities.getUuid(),
    openaiApiKey: '',
    openaiModel: 'gpt-4o'
  };
  PROPS.setProperty(SETTINGS_KEY, JSON.stringify(defaults));
  return defaults;
}

function saveSettingsRaw(settings) {
  PROPS.setProperty(SETTINGS_KEY, JSON.stringify(settings));
}

/** What the admin UI is allowed to see (never the raw key/hash/secret). */
function publicSettings() {
  var s = getSettings();
  var folder = getOrCreateDriveFolder();
  return {
    brandName: s.brandName,
    adminUsername: s.adminUsername,
    openaiConfigured: !!s.openaiApiKey,
    openaiModel: s.openaiModel,
    driveFolderUrl: folder.getUrl(),
    spreadsheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl()
  };
}

function saveSettings(payload) {
  var s = getSettings();
  if (typeof payload.brandName === 'string' && payload.brandName.trim()) {
    s.brandName = payload.brandName.trim();
  }
  if (typeof payload.openaiApiKey === 'string' && payload.openaiApiKey.trim()) {
    s.openaiApiKey = payload.openaiApiKey.trim();
  }
  if (typeof payload.openaiModel === 'string' && payload.openaiModel.trim()) {
    s.openaiModel = payload.openaiModel.trim();
  }
  saveSettingsRaw(s);
  return publicSettings();
}

function changeAdminAccount(payload) {
  var s = getSettings();
  var errors = [];

  if (payload.newUsername && String(payload.newUsername).trim()) {
    s.adminUsername = String(payload.newUsername).trim();
  }
  if (payload.newPassword && String(payload.newPassword).trim()) {
    if (!payload.currentPassword || !verifyPassword(payload.currentPassword, s.adminPasswordHash)) {
      errors.push('Current password is incorrect — password was not changed.');
    } else if (String(payload.newPassword).trim().length < 8) {
      errors.push('New password must be at least 8 characters — password was not changed.');
    } else {
      s.adminPasswordHash = hashPassword(String(payload.newPassword).trim());
    }
  }
  saveSettingsRaw(s);
  return { settings: publicSettings(), errors: errors.length ? errors : null };
}

// ─────────────────────────────────────────────────────────────────────────
// Auth — simple salted-hash password + HMAC session token (no cookies
// needed; the frontend stores the token in localStorage and sends it back
// as payload.token on every admin call).
// ─────────────────────────────────────────────────────────────────────────

function hashPassword(password) {
  var salt = Utilities.getUuid();
  var digestBytes = Utilities.computeHmacSha256Signature(password, salt);
  var digest = Utilities.base64Encode(digestBytes);
  return salt + ':' + digest;
}

function verifyPassword(password, stored) {
  if (!stored || stored.indexOf(':') === -1) return false;
  var parts = stored.split(':');
  var salt = parts[0];
  var expected = parts[1];
  var digestBytes = Utilities.computeHmacSha256Signature(password, salt);
  var digest = Utilities.base64Encode(digestBytes);
  return digest === expected;
}

function signToken(username, expiresAt) {
  var s = getSettings();
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({ u: username, exp: expiresAt }));
  var sigBytes = Utilities.computeHmacSha256Signature(payload, s.tokenSecret);
  var sig = Utilities.base64EncodeWebSafe(sigBytes);
  return payload + '.' + sig;
}

function verifyToken(token) {
  if (!token || token.indexOf('.') === -1) return null;
  var s = getSettings();
  var parts = token.split('.');
  var payload = parts[0];
  var sig = parts[1];
  var expectedSigBytes = Utilities.computeHmacSha256Signature(payload, s.tokenSecret);
  var expectedSig = Utilities.base64EncodeWebSafe(expectedSigBytes);
  if (sig !== expectedSig) return null;
  var data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(payload)).getDataAsString());
  if (!data.exp || Date.now() > data.exp) return null;
  return data;
}

function adminLogin(username, password) {
  var s = getSettings();
  if (
    !username || !password ||
    String(username).trim().toLowerCase() !== s.adminUsername.trim().toLowerCase() ||
    !verifyPassword(password, s.adminPasswordHash)
  ) {
    return { error: 'Invalid username or password.' };
  }
  var expiresAt = Date.now() + TOKEN_TTL_MS;
  return { token: signToken(s.adminUsername, expiresAt), username: s.adminUsername };
}

function requireAdmin(token) {
  var data = verifyToken(token);
  if (!data) throw new Error('Not authorized. Please log in again.');
  return { authenticated: true, username: data.u };
}

// ─────────────────────────────────────────────────────────────────────────
// Sheet helpers
// ─────────────────────────────────────────────────────────────────────────

function getOrCreateSheet(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  } else if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function leadsSheet() {
  return getOrCreateSheet(LEADS_SHEET, LEADS_HEADER);
}

function questionsSheetRef() {
  var sheet = getOrCreateSheet(QUESTIONS_SHEET, QUESTIONS_HEADER);
  if (sheet.getLastRow() < 2) {
    var seeded = seedQuestions();
    writeQuestionRows(sheet, seeded);
  }
  return sheet;
}

// ─────────────────────────────────────────────────────────────────────────
// Drive helpers
// ─────────────────────────────────────────────────────────────────────────

function getOrCreateDriveFolder() {
  var id = PROPS.getProperty(DRIVE_FOLDER_KEY);
  if (id) {
    try {
      return DriveApp.getFolderById(id);
    } catch (err) {
      // stored id no longer valid — fall through and recreate
    }
  }
  var s = getSettings();
  var folder = DriveApp.createFolder(s.brandName + ' — Oral Health Test Photos');
  PROPS.setProperty(DRIVE_FOLDER_KEY, folder.getId());
  return folder;
}

/** dataUrl looks like "data:image/jpeg;base64,AAAA..." */
function uploadPhoto(dataUrl, filename) {
  var match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid photo data.');
  var mimeType = match[1];
  var base64 = match[2];
  var bytes = Utilities.base64Decode(base64);
  var blob = Utilities.newBlob(bytes, mimeType, filename);
  var folder = getOrCreateDriveFolder();
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return 'https://lh3.googleusercontent.com/d/' + file.getId();
}

// ─────────────────────────────────────────────────────────────────────────
// Assessment questions — a self-report intake form (age, symptoms, habits,
// history) that gets combined with the photos for the AI analysis. There
// is no "correct answer" here; nothing is graded.
//
// Question types: 'number' | 'text' | 'yes_no' | 'single_choice'
// A question can optionally depend on a prior yes_no/single_choice answer
// via dependsOnId + dependsOnValue (e.g. only ask "which aligner type?" if
// "used aligners before?" was answered "Yes").
// ─────────────────────────────────────────────────────────────────────────

function seedQuestions() {
  var raw = [
    { id: 'age', text: 'What is your age?', type: 'number', options: [], category: 'age' },
    { id: 'gum_bleeding', text: 'Do your gums bleed when you brush or floss?', type: 'single_choice',
      options: ['Never', 'Sometimes', 'Often'], category: 'gum_bleeding' },
    { id: 'tooth_pain', text: 'Do you feel any tooth pain or sensitivity?', type: 'single_choice',
      options: ['No pain', 'Mild sensitivity to hot or cold', 'Occasional pain', 'Frequent or severe pain'],
      category: 'tooth_pain' },
    { id: 'tooth_color', text: 'How would you describe the color of your teeth?', type: 'single_choice',
      options: ['Bright white', 'Slightly yellow', 'Noticeably yellow or stained', 'Brown or dark stains'],
      category: 'tooth_color' },
    { id: 'brush_type', text: 'What type of toothbrush do you use?', type: 'single_choice',
      options: ['Manual – soft bristles', 'Manual – medium or hard bristles', 'Electric toothbrush', 'Not sure'],
      category: 'brush_type' },
    { id: 'brushing_freq', text: 'How often do you brush your teeth?', type: 'single_choice',
      options: ['Twice a day', 'Once a day', 'A few times a week', 'Rarely'], category: 'brushing_freq' },
    { id: 'flossing', text: 'Do you floss regularly?', type: 'yes_no', options: [], category: 'flossing' },
    { id: 'root_canal', text: 'Have you ever had a root canal treatment?', type: 'yes_no', options: [],
      category: 'root_canal_history' },
    { id: 'root_canal_detail', text: 'Which tooth, and roughly how long ago?', type: 'text', options: [],
      category: 'root_canal_detail', dependsOnId: 'root_canal', dependsOnValue: 'Yes' },
    { id: 'ortho', text: 'Have you used braces or clear aligners before?', type: 'yes_no', options: [],
      category: 'ortho_history' },
    { id: 'ortho_detail', text: 'Which type did you use (e.g. metal braces, Invisalign)?', type: 'text', options: [],
      category: 'ortho_detail', dependsOnId: 'ortho', dependsOnValue: 'Yes' },
    { id: 'smoking', text: 'Do you smoke or use any tobacco products?', type: 'yes_no', options: [],
      category: 'smoking' },
    { id: 'dental_visits', text: 'How often do you visit a dentist?', type: 'single_choice',
      options: ['Every 6 months', 'Once a year', 'Rarely', 'Never'], category: 'dental_visits' },
    { id: 'allergies', text: 'Any known allergies to dental materials or medications? (optional)', type: 'text',
      options: [], category: 'allergies' }
  ];
  return raw.map(function (q, i) {
    return {
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options || [],
      category: q.category,
      dependsOnId: q.dependsOnId || '',
      dependsOnValue: q.dependsOnValue || '',
      active: true,
      order: i + 1
    };
  });
}

function questionToRow(q) {
  return [
    q.id, q.text, q.type, JSON.stringify(q.options || []), q.category,
    q.dependsOnId || '', q.dependsOnValue || '', q.active ? 'TRUE' : 'FALSE', q.order
  ];
}

function rowToQuestion(row) {
  if (!row || !row[0]) return null;
  var options = [];
  try { options = JSON.parse(row[3] || '[]'); } catch (e) { options = []; }
  return {
    id: String(row[0]),
    text: String(row[1] || ''),
    type: String(row[2] || 'text'),
    options: options,
    category: String(row[4] || 'general'),
    dependsOnId: String(row[5] || ''),
    dependsOnValue: String(row[6] || ''),
    active: String(row[7] || 'TRUE').toUpperCase() !== 'FALSE',
    order: Number(row[8] || 0)
  };
}

function writeQuestionRows(sheet, questions) {
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, QUESTIONS_HEADER.length).clearContent();
  }
  if (questions.length > 0) {
    var rows = questions.map(questionToRow);
    sheet.getRange(2, 1, rows.length, QUESTIONS_HEADER.length).setValues(rows);
  }
}

function getAllQuestions() {
  var sheet = questionsSheetRef();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var rows = sheet.getRange(2, 1, lastRow - 1, QUESTIONS_HEADER.length).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var q = rowToQuestion(rows[i]);
    if (q) out.push(q);
  }
  return out.sort(function (a, b) { return a.order - b.order; });
}

function saveQuestions(questions) {
  var sheet = questionsSheetRef();
  writeQuestionRows(sheet, questions || []);
}

/** All active questions, in order — this is a fixed assessment, not a
 * shuffled trivia sample, so every visitor answers the same set. */
function getPublicQuestions() {
  return getAllQuestions().filter(function (q) { return q.active; });
}

/** Turns raw answers into a readable block for the OpenAI prompt, e.g.
 * "Age: 29\nGum bleeding: Often\n...". Skips blanks. */
function buildAnswersSummary(questions, answers) {
  var byId = {};
  questions.forEach(function (q) { byId[q.id] = q; });
  var byAnswerId = {};
  (answers || []).forEach(function (a) { byAnswerId[a.questionId] = a.value; });

  var lines = [];
  questions.forEach(function (q) {
    var val = byAnswerId[q.id];
    if (val === undefined || val === null || String(val).trim() === '') return;
    lines.push(q.text + ' — ' + String(val).trim());
  });
  return lines.join('\n');
}

/** Points added to the risk score from specific self-reported symptoms /
 * habits (NOT from history questions like "had a root canal before?",
 * which are informational only — a past, already-treated fact isn't an
 * active risk signal on its own). Keyed by category so it keeps working
 * even if an admin edits the question wording. */
var SELF_REPORT_RISK_MAP = {
  gum_bleeding: { Never: 0, Sometimes: 8, Often: 18 },
  tooth_pain: { 'No pain': 0, 'Mild sensitivity to hot or cold': 6, 'Occasional pain': 14, 'Frequent or severe pain': 26 },
  tooth_color: { 'Bright white': 0, 'Slightly yellow': 3, 'Noticeably yellow or stained': 8, 'Brown or dark stains': 14 },
  brushing_freq: { 'Twice a day': 0, 'Once a day': 3, 'A few times a week': 10, Rarely: 16 },
  flossing: { Yes: 0, No: 6 },
  smoking: { Yes: 15, No: 0 },
  dental_visits: { 'Every 6 months': 0, 'Once a year': 4, Rarely: 10, Never: 15 }
};

function computeSelfReportedRisk(questions, answers) {
  var byId = {};
  questions.forEach(function (q) { byId[q.id] = q; });
  var total = 0;
  (answers || []).forEach(function (a) {
    var q = byId[a.questionId];
    if (!q) return;
    var map = SELF_REPORT_RISK_MAP[q.category];
    if (map && Object.prototype.hasOwnProperty.call(map, a.value)) {
      total += map[a.value];
    }
  });
  return total;
}

// ─────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────

var CATEGORY_WEIGHTS = {
  alignment: 0.15,
  decayCavities: 0.30,
  gumHealth: 0.25,
  enamelWear: 0.15,
  stainingColor: 0.15
};

function computeOralHealthScore(analysis) {
  var c = analysis.categories || {};
  var get = function (k) { return c[k] && typeof c[k].score === 'number' ? c[k].score : 50; };
  var raw =
    get('alignment') * CATEGORY_WEIGHTS.alignment +
    get('decayCavities') * CATEGORY_WEIGHTS.decayCavities +
    get('gumHealth') * CATEGORY_WEIGHTS.gumHealth +
    get('enamelWear') * CATEGORY_WEIGHTS.enamelWear +
    get('stainingColor') * CATEGORY_WEIGHTS.stainingColor;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

var SEVERITY_PENALTY = { none: 0, mild: 8, moderate: 18, severe: 30 };

/** selfReportedRiskPoints comes from computeSelfReportedRisk() — real
 * symptoms/habits the visitor told us about, not visible in a photo. */
function computeRiskScore(analysis, selfReportedRiskPoints, hasContactInfo) {
  var c = analysis.categories || {};
  var sev = function (k) {
    return c[k] && SEVERITY_PENALTY.hasOwnProperty(c[k].severity) ? SEVERITY_PENALTY[c[k].severity] : 0;
  };
  var score =
    sev('decayCavities') * 1.2 +
    sev('gumHealth') * 1.1 +
    sev('alignment') * 0.7 +
    sev('enamelWear') * 0.8 +
    sev('stainingColor') * 0.4;

  if (analysis.rootCanalRiskFlag) score += 25;
  // A genuine, visible aligner candidate is a real product-fit lead for the
  // clinic even when their general oral health score is otherwise fine —
  // worth surfacing on the dashboard, not just buried in a "cold" bucket.
  if (analysis.alignmentDetail && analysis.alignmentDetail.alignerCandidate) score += 20;
  score += (selfReportedRiskPoints || 0);
  if (hasContactInfo) score += 5;

  return Math.round(Math.max(0, Math.min(100, score)));
}

function classifyTemperature(riskScore) {
  if (riskScore >= 55) return 'hot';
  if (riskScore >= 28) return 'warm';
  return 'cold';
}

// ─────────────────────────────────────────────────────────────────────────
// OpenAI vision analysis
// ─────────────────────────────────────────────────────────────────────────

var ZONE_ENUM = ['upper-front', 'upper-left', 'upper-right', 'lower-front', 'lower-left', 'lower-right'];

var CATEGORY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    score: { type: 'integer', description: '0-100, higher = healthier' },
    severity: { type: 'string', enum: ['none', 'mild', 'moderate', 'severe'] },
    summary: {
      type: 'string',
      description: 'Two to three plain-language sentences. Be specific and concrete — name the actual ' +
        'tooth/area/color/shade you are describing rather than speaking in generalities.'
    }
  },
  required: ['score', 'severity', 'summary']
};

var ALIGNMENT_DETAIL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    crowdingZones: {
      type: 'array',
      items: { type: 'string', enum: ZONE_ENUM },
      description: 'Zones with visibly crowded/overlapping teeth. Empty array if none.'
    },
    spacingZones: {
      type: 'array',
      items: { type: 'string', enum: ZONE_ENUM },
      description: 'Zones with visible gaps/spacing between teeth. Empty array if none.'
    },
    biteNote: {
      type: 'string',
      description: 'One sentence on bite/midline alignment if visible from the photos, else "Not clearly visible in photos."'
    },
    alignerCandidate: {
      type: 'boolean',
      description: 'True only if there is a genuine, visible alignment issue (crowding, spacing, rotation, ' +
        'or bite misalignment) that clear aligners commonly treat. False for straight/healthy alignment — ' +
        'do not default to true, and never suggest this for someone with no visible issue.'
    },
    alignerNote: {
      type: 'string',
      description: 'If alignerCandidate is true: one honest, non-pushy patient-facing sentence on why clear ' +
        'aligners could be worth asking about. If false: empty string.'
    }
  },
  required: ['crowdingZones', 'spacingZones', 'biteNote', 'alignerCandidate', 'alignerNote']
};

var ANALYSIS_JSON_SCHEMA = {
  name: 'oral_health_analysis',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      overallScore: { type: 'integer' },
      categories: {
        type: 'object',
        additionalProperties: false,
        properties: {
          alignment: CATEGORY_SCHEMA,
          decayCavities: CATEGORY_SCHEMA,
          gumHealth: CATEGORY_SCHEMA,
          enamelWear: CATEGORY_SCHEMA,
          stainingColor: CATEGORY_SCHEMA
        },
        required: ['alignment', 'decayCavities', 'gumHealth', 'enamelWear', 'stainingColor']
      },
      alignmentDetail: ALIGNMENT_DETAIL_SCHEMA,
      patientSummary: {
        type: 'string',
        description: 'A warm, reassuring 3-5 sentence personal summary of this person\'s oral health, written ' +
          'directly to them ("your..."). Blend what the photos show with what they reported (age, habits, ' +
          'symptoms). Lead with genuine positives, then the key things worth attention, and close by framing a ' +
          'professional check-up as the natural next step. Calm and encouraging — never alarming.'
      },
      strengths: {
        type: 'array', items: { type: 'string' },
        description: '2-4 genuine positives you can actually see or infer (e.g. "Healthy pink gums on the upper arch"). ' +
          'Never invent positives.'
      },
      attentionAreas: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            title: { type: 'string', description: 'Short label, e.g. "Lower front crowding".' },
            location: { type: 'string', description: 'Where, as specifically as the photo allows, e.g. "Upper-left molar, chewing surface". "General" if not location-specific.' },
            detail: { type: 'string', description: 'One or two calm, plain sentences on what was seen and why it matters.' },
            urgency: { type: 'string', enum: ['routine', 'soon', 'priority'] }
          },
          required: ['title', 'location', 'detail', 'urgency']
        },
        description: 'Ordered most important first. Empty array if nothing needs attention.'
      },
      recommendedTreatments: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            service: {
              type: 'string',
              enum: ['Invisible Aligners', 'Microscopic Root Canal Treatment', 'Professional Cleaning & Scaling',
                'Teeth Whitening', 'Tooth-coloured Fillings', 'Crowns & Veneers (Smile Correction)',
                'Dental Implants', 'Gum Care Treatment', 'Routine Check-up']
            },
            reason: { type: 'string', description: 'One sentence tying this service to a specific finding for this person.' },
            fit: { type: 'string', enum: ['strong', 'possible'] }
          },
          required: ['service', 'reason', 'fit']
        },
        description: 'Only services genuinely supported by the findings, strongest first, max 4. Always include ' +
          '"Routine Check-up" if nothing else applies.'
      },
      habitInsights: {
        type: 'array', items: { type: 'string' },
        description: '2-4 short, practical, personalised tips drawn from their self-reported habits and answers ' +
          '(e.g. switching to a soft brush, flossing, reducing tobacco). Friendly, never preachy.'
      },
      staffNote: {
        type: 'string',
        description: 'INTERNAL, clinic staff only (never shown to the patient): 2-3 sentences on the best ' +
          'consultation angle for this lead — primary service opportunity, the concern most likely to motivate ' +
          'them, and anything to be sensitive about.'
      },
      rootCanalRiskFlag: { type: 'boolean' },
      rootCanalRiskNote: { type: 'string' },
      detectedIssues: {
        type: 'array',
        items: { type: 'string' },
        description: 'Specific, concrete findings. Whenever an issue applies to a particular tooth or area, ' +
          'name it (e.g. "Dark spot on the chewing surface of an upper-left molar, consistent with early decay" ' +
          'rather than just "possible decay").'
      },
      recommendedProductTags: { type: 'array', items: { type: 'string' } },
      professionalAdviceNote: { type: 'string' },
      photoQualityWarning: { type: ['string', 'null'] }
    },
    required: [
      'overallScore', 'categories', 'alignmentDetail', 'patientSummary', 'strengths', 'attentionAreas',
      'recommendedTreatments', 'habitInsights', 'staffNote', 'rootCanalRiskFlag', 'rootCanalRiskNote',
      'detectedIssues', 'recommendedProductTags', 'professionalAdviceNote', 'photoQualityWarning'
    ]
  }
};

var SYSTEM_PROMPT = "CLINIC CONTEXT: You work for Amend Dental Centre (Kerala, India — branches in Calicut, " +
  "Kannur, Thalassery, Nadapuram and Kottakkal), known for invisible aligners made in its own lab with fast " +
  "turnaround, microscopic root canal treatment, implants, and smile correction (crowns/veneers). Only recommend " +
  "services from the allowed list, and only when the findings genuinely support them.\n\n" +
  "TONE: The report must reassure and motivate, never frighten. Describe findings honestly but calmly, avoid " +
  "alarming words (e.g. say 'worth having checked soon', not 'dangerous' or 'urgent'), and frame the free " +
  "consultation as the natural, easy next step. The patient summary, strengths, habit insights and treatment " +
  "reasons are patient-facing; staffNote is internal only.\n\n" +
  "You are a senior dental-screening analyst used by a dental clinic's own intake tool. Your " +
  "two jobs, equally important: (1) give this specific patient a genuinely thorough, accurate, trustworthy " +
  "screening of their own oral health — this is health-adjacent information and it must be dependable, not " +
  "generic filler; (2) help the clinic identify who has a real, visible need for its services, especially " +
  "clear/invisible aligners, so honest candidacy matters commercially as well as clinically. Never let goal (2) " +
  "distort goal (1) — do not invent or exaggerate findings, and do not flag aligner-candidacy for someone whose " +
  "teeth are visibly straight.\n\n" +
  "You will be shown up to 3 smartphone photos (typically a front smile, an upper close-up, a lower close-up), " +
  "plus this person's answers to a self-reported intake form (age, symptoms like pain or bleeding gums, habits, " +
  "and history like past root canals or orthodontic treatment). Use both sources together: ground every score in " +
  "what is actually visible in the photos, and let the self-reported answers corroborate or add signal you can't " +
  "see — e.g. reported frequent pain or bleeding gums matters even without an obvious visible cause, and a " +
  "reported PAST root canal on a tooth is history, not a new active risk sign.\n\n" +
  "EXAMINE EACH PHOTO CAREFULLY AND IN DEPTH before scoring anything:\n" +
  "- Color and shade: describe the actual tooth shade you see (e.g. bright white, off-white, yellow-toned, " +
  "visible brown/grey staining) and exactly where any discoloration is concentrated (tips, gumline, between " +
  "teeth, one specific tooth).\n" +
  "- Size, spacing and alignment: look tooth-by-tooth across the visible arch for crowding, rotation, overlap, " +
  "gaps, and how the upper and lower midlines/bite line up. Note which side(s) — left, right, front — each issue " +
  "is on.\n" +
  "- Decay and surface changes: look for dark spots, pits, visible holes, chalky white spots (early demineralization), " +
  "or rough/broken edges. If you find something, say which tooth or area as specifically as you can from the " +
  "image (e.g. \"upper-right, second tooth from center\") — never just say \"possible decay\" with no location.\n" +
  "- Gum tissue: describe the actual gum color and texture you see (healthy gums are typically a consistent " +
  "coral/salmon pink) — note any redness, puffiness, recession, or dark/purple discoloration, and where.\n" +
  "- Enamel and wear: look for flattened or chipped edges, translucency at the tips, or rough texture.\n\n" +
  "Write each category summary as 2-3 concrete sentences — enough for the patient to understand exactly what " +
  "you saw and why you scored it that way. Avoid vague filler like \"looks generally okay\"; say what you " +
  "actually observed, even for healthy findings (e.g. \"Gums are a healthy, even pink with no visible swelling " +
  "or recession.\").\n\n" +
  "Alignment detail: separately assess crowding and spacing by zone (upper/lower x left/right/front), note the " +
  "bite/midline if visible, and decide alignerCandidate honestly — true only for a real, visible alignment issue " +
  "aligners commonly address, false for straight or near-straight teeth.\n\n" +
  "You are NOT diagnosing disease and cannot replace an in-person dental exam, X-rays, or probing — say so via " +
  "professionalAdviceNote. If a photo is too blurry, dark, zoomed out, or doesn't show teeth clearly, say so in " +
  "photoQualityWarning and score conservatively rather than guessing. Only set rootCanalRiskFlag=true when there " +
  "is a clearly visible sign consistent with deep decay or a possibly dying/infected tooth that has NOT already " +
  "been treated — this should be rare, not a default. Keep language plain and patient-facing, but do not sacrifice " +
  "specificity or accuracy for brevity.";

function callOpenAIVision(photos, answersSummary, apiKey, model) {
  var imageContent = photos.map(function (dataUrl) {
    return { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } };
  });

  var introText = 'Here are the photos for this oral health screening.';
  if (answersSummary) {
    introText += '\n\nSelf-reported intake form:\n' + answersSummary;
  }
  introText += '\n\nAnalyze all of this together and return the structured result.';

  var body = {
    model: model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [{ type: 'text', text: introText }].concat(imageContent)
      }
    ],
    response_format: { type: 'json_schema', json_schema: ANALYSIS_JSON_SCHEMA },
    max_tokens: 2400
  };

  var response = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + apiKey },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  var text = response.getContentText();

  if (code !== 200) {
    var errMsg = 'OpenAI request failed (HTTP ' + code + ').';
    try {
      var errJson = JSON.parse(text);
      if (errJson.error && errJson.error.message) errMsg = errJson.error.message;
    } catch (e) { /* ignore parse failure, use generic message */ }
    throw new Error(errMsg);
  }

  var data = JSON.parse(text);
  var content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!content) throw new Error('OpenAI returned an empty response.');
  return JSON.parse(content);
}

// ─────────────────────────────────────────────────────────────────────────
// Run-once protection. Phones on mobile data sometimes lose the response
// even though the work succeeded, and the website then retries. This makes
// a retry with the same key return the original result instead of running
// OpenAI twice or writing a duplicate lead row.
// ─────────────────────────────────────────────────────────────────────────
function runOnce(key, ttlSeconds, fn) {
  var cache = CacheService.getScriptCache();
  var doneKey = 'done_' + key, flightKey = 'flight_' + key;
  var done = cache.get(doneKey);
  if (done) return JSON.parse(done);

  var mine = false;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    done = cache.get(doneKey);
    if (done) return JSON.parse(done);
    if (!cache.get(flightKey)) { cache.put(flightKey, '1', 300); mine = true; }
  } finally {
    lock.releaseLock();
  }

  if (!mine) {
    // The original attempt is still running — wait for its result.
    for (var i = 0; i < 120; i++) {
      Utilities.sleep(1000);
      done = cache.get(doneKey);
      if (done) return JSON.parse(done);
      if (!cache.get(flightKey)) break; // original attempt failed — fall through and try ourselves
    }
  }

  try {
    var result = fn();
    if (result && !result.error) {
      try { cache.put(doneKey, JSON.stringify(result), ttlSeconds); } catch (e) { /* too large to cache — fine */ }
    }
    return result;
  } finally {
    if (mine) cache.remove(flightKey);
  }
}

function analyzePhotos(payload) {
  var key = 'analyze_' + String(payload.requestId || Utilities.getUuid());
  return runOnce(key, 21600, function () { return analyzePhotosOnce(payload); });
}

function analyzePhotosOnce(payload) {
  var s = getSettings();
  if (!s.openaiApiKey) {
    return { error: 'OpenAI API key is not set yet. Go to Admin → Settings to add it.', code: 'openai_not_configured' };
  }
  var photos = payload.photos || [];
  if (photos.length < 3) {
    return { error: 'Please upload all 3 photos before analyzing.' };
  }

  var questions = getAllQuestions();
  var answersSummary = buildAnswersSummary(questions, payload.answers || []);

  var analysis = callOpenAIVision(photos, answersSummary, s.openaiApiKey, s.openaiModel || 'gpt-4o');
  var oralHealthScore = computeOralHealthScore(analysis);

  var token = Utilities.getUuid();
  CacheService.getScriptCache().put(
    'analysis_' + token,
    JSON.stringify({ analysis: analysis, oralHealthScore: oralHealthScore }),
    21600 // 6 hours — the max Apps Script allows
  );

  return { analysisToken: token, analysis: analysis, oralHealthScore: oralHealthScore };
}

function testOpenAIKey(apiKey) {
  if (!apiKey) return { ok: false, error: 'No API key set yet.' };
  var response = UrlFetchApp.fetch('https://api.openai.com/v1/models', {
    method: 'get',
    headers: { Authorization: 'Bearer ' + apiKey },
    muteHttpExceptions: true
  });
  if (response.getResponseCode() === 200) return { ok: true };
  var msg = 'That key did not work.';
  try {
    var j = JSON.parse(response.getContentText());
    if (j.error && j.error.message) msg = j.error.message;
  } catch (e) { /* ignore */ }
  return { ok: false, error: msg };
}

// ─────────────────────────────────────────────────────────────────────────
// Leads
// ─────────────────────────────────────────────────────────────────────────

function leadToRow(lead) {
  return [
    lead.timestamp, lead.leadId, lead.name, lead.phone, lead.email, lead.refSource,
    lead.photoUrls[0] || '', lead.photoUrls[1] || '', lead.photoUrls[2] || '',
    lead.oralHealthScore,
    lead.analysis.categories.alignment.score,
    lead.analysis.categories.decayCavities.score,
    lead.analysis.categories.gumHealth.score,
    lead.analysis.categories.enamelWear.score,
    lead.analysis.categories.stainingColor.score,
    lead.analysis.rootCanalRiskFlag ? 'TRUE' : 'FALSE',
    JSON.stringify(lead.analysis.detectedIssues || []),
    JSON.stringify(lead.analysis.recommendedProductTags || []),
    JSON.stringify(lead.assessmentAnswers || []),
    JSON.stringify(lead.analysis),
    lead.riskScore,
    lead.temperature,
    lead.status,
    lead.notes
  ];
}

function rowToLead(row) {
  if (!row || !row[1]) return null;
  var analysis = {};
  var assessmentAnswers = [];
  try { analysis = JSON.parse(row[19] || '{}'); } catch (e) { analysis = {}; }
  try { assessmentAnswers = JSON.parse(row[18] || '[]'); } catch (e) { assessmentAnswers = []; }
  return {
    timestamp: row[0],
    leadId: String(row[1]),
    name: row[2] || '',
    phone: row[3] || '',
    email: row[4] || '',
    refSource: row[5] || '',
    photoUrls: [row[6], row[7], row[8]].filter(function (u) { return !!u; }),
    oralHealthScore: Number(row[9] || 0),
    analysis: analysis,
    assessmentAnswers: assessmentAnswers,
    riskScore: Number(row[20] || 0),
    temperature: row[21] || 'cold',
    status: row[22] || 'new',
    notes: row[23] || ''
  };
}

function submitLead(payload) {
  if (!payload.analysisToken) return { error: 'Missing analysis. Please upload your photos again.' };
  return runOnce('submit_' + payload.analysisToken, 21600, function () { return submitLeadOnce(payload); });
}

function submitLeadOnce(payload) {
  var cacheKey = 'analysis_' + payload.analysisToken;
  var cached = CacheService.getScriptCache().get(cacheKey);
  if (!cached) {
    return { error: 'Your analysis has expired. Please upload your photos again.' };
  }
  var cachedData = JSON.parse(cached);

  var questions = getAllQuestions();
  var rawAnswers = payload.answers || [];
  // keep only answers to real, currently-known questions
  var byId = {};
  questions.forEach(function (q) { byId[q.id] = q; });
  var cleanAnswers = rawAnswers
    .filter(function (a) { return a && byId[a.questionId] !== undefined && a.value !== undefined && a.value !== null && String(a.value).trim() !== ''; })
    .map(function (a) {
      var q = byId[a.questionId];
      return { questionId: a.questionId, text: q.text, value: String(a.value).trim() };
    });

  var selfReportedRisk = computeSelfReportedRisk(questions, cleanAnswers);
  var hasContactInfo = !!(payload.phone || payload.email);
  var riskScore = computeRiskScore(cachedData.analysis, selfReportedRisk, hasContactInfo);
  var temperature = classifyTemperature(riskScore);

  var photoUrls = [];
  var photos = payload.photos || [];
  for (var i = 0; i < photos.length; i++) {
    if (photos[i]) {
      photoUrls.push(uploadPhoto(photos[i], Date.now() + '_' + (i + 1) + '.jpg'));
    }
  }

  var lead = {
    leadId: Utilities.getUuid().split('-')[0] + Utilities.getUuid().split('-')[0],
    timestamp: new Date().toISOString(),
    name: payload.name || 'Anonymous',
    phone: payload.phone || '',
    email: payload.email || '',
    refSource: payload.refSource || 'direct',
    photoUrls: photoUrls,
    analysis: cachedData.analysis,
    assessmentAnswers: cleanAnswers,
    oralHealthScore: cachedData.oralHealthScore,
    riskScore: riskScore,
    temperature: temperature,
    status: 'new',
    notes: ''
  };

  leadsSheet().appendRow(leadToRow(lead));
  CacheService.getScriptCache().remove(cacheKey);

  return { leadId: lead.leadId };
}

function getAllLeads() {
  var sheet = leadsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var rows = sheet.getRange(2, 1, lastRow - 1, LEADS_HEADER.length).getValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var lead = rowToLead(rows[i]);
    if (lead) out.push(lead);
  }
  return out.reverse(); // newest first
}

/** Finds a lead's sheet row directly (TextFinder) instead of reading every row. */
function findLeadRow(leadId) {
  var sheet = leadsSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2 || !leadId) return -1;
  var cell = sheet.getRange(2, 2, lastRow - 1, 1)   // column B = LeadID
    .createTextFinder(String(leadId)).matchEntireCell(true).findNext();
  return cell ? cell.getRow() : -1;
}

function getLeadById(leadId) {
  var row = findLeadRow(leadId);
  if (row === -1) return null;
  var values = leadsSheet().getRange(row, 1, 1, LEADS_HEADER.length).getValues()[0];
  return rowToLead(values);
}

function updateLead(leadId, updates) {
  var row = findLeadRow(leadId);
  if (row === -1) throw new Error('Lead not found.');
  var sheet = leadsSheet();
  if (updates && typeof updates.status === 'string') sheet.getRange(row, STATUS_COL).setValue(updates.status);
  if (updates && typeof updates.notes === 'string') sheet.getRange(row, NOTES_COL).setValue(updates.notes);
}

// ─────────────────────────────────────────────────────────────────────────
// Share links
// ─────────────────────────────────────────────────────────────────────────

function getLinks() {
  var raw = PROPS.getProperty(LINKS_KEY);
  return raw ? JSON.parse(raw) : [];
}

function saveLinksRaw(links) {
  PROPS.setProperty(LINKS_KEY, JSON.stringify(links));
}

function addLink(label, code) {
  var links = getLinks();
  var cleanCode = (code && String(code).trim())
    ? String(code).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 40)
    : Utilities.getUuid().slice(0, 8);
  var exists = links.some(function (l) { return l.code === cleanCode; });
  if (!exists) {
    links.unshift({
      code: cleanCode,
      label: (label && String(label).trim()) || 'Untitled link',
      createdAt: new Date().toISOString()
    });
    saveLinksRaw(links);
  }
  return links;
}

function removeLink(code) {
  var links = getLinks().filter(function (l) { return l.code !== code; });
  saveLinksRaw(links);
  return links;
}
