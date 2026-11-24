// Assessment questions — a self-report intake form (age, symptoms, habits,
// history) combined with the photos for the AI analysis. Nothing is graded.
//
// Question types: 'number' | 'text' | 'yes_no' | 'single_choice'
// A question can depend on a prior yes_no/single_choice answer via
// dependsOnId + dependsOnValue (e.g. only ask "which tooth?" if "had a root
// canal?" was answered "Yes").
//
// Pure functions only — the database side lives in lib/data.js.

export const QUESTION_TYPES = ["number", "text", "yes_no", "single_choice"];

export function seedQuestions() {
  const raw = [
    { id: "age", text: "What is your age?", type: "number", category: "age" },
    { id: "gum_bleeding", text: "Do your gums bleed when you brush or floss?", type: "single_choice",
      options: ["Never", "Sometimes", "Often"], category: "gum_bleeding" },
    { id: "tooth_pain", text: "Do you feel any tooth pain or sensitivity?", type: "single_choice",
      options: ["No pain", "Mild sensitivity to hot or cold", "Occasional pain", "Frequent or severe pain"],
      category: "tooth_pain" },
    { id: "tooth_color", text: "How would you describe the color of your teeth?", type: "single_choice",
      options: ["Bright white", "Slightly yellow", "Noticeably yellow or stained", "Brown or dark stains"],
      category: "tooth_color" },
    { id: "brush_type", text: "What type of toothbrush do you use?", type: "single_choice",
      options: ["Manual – soft bristles", "Manual – medium or hard bristles", "Electric toothbrush", "Not sure"],
      category: "brush_type" },
    { id: "brushing_freq", text: "How often do you brush your teeth?", type: "single_choice",
      options: ["Twice a day", "Once a day", "A few times a week", "Rarely"], category: "brushing_freq" },
    { id: "flossing", text: "Do you floss regularly?", type: "yes_no", category: "flossing" },
    { id: "root_canal", text: "Have you ever had a root canal treatment?", type: "yes_no", category: "root_canal_history" },
    { id: "root_canal_detail", text: "Which tooth, and roughly how long ago?", type: "text",
      category: "root_canal_detail", dependsOnId: "root_canal", dependsOnValue: "Yes" },
    { id: "ortho", text: "Have you used braces or clear aligners before?", type: "yes_no", category: "ortho_history" },
    { id: "ortho_detail", text: "Which type did you use (e.g. metal braces, Invisalign)?", type: "text",
      category: "ortho_detail", dependsOnId: "ortho", dependsOnValue: "Yes" },
    { id: "smoking", text: "Do you smoke or use any tobacco products?", type: "yes_no", category: "smoking" },
    { id: "dental_visits", text: "How often do you visit a dentist?", type: "single_choice",
      options: ["Every 6 months", "Once a year", "Rarely", "Never"], category: "dental_visits" },
    { id: "allergies", text: "Any known allergies to dental materials or medications? (optional)", type: "text",
      category: "allergies" },
  ];
  return raw.map((q, i) => ({
    id: q.id,
    text: q.text,
    type: q.type,
    options: q.options || [],
    category: q.category,
    dependsOnId: q.dependsOnId || "",
    dependsOnValue: q.dependsOnValue || "",
    active: true,
    order: i + 1,
  }));
}

/** Validates + cleans one question coming from the admin editor. */
export function normalizeQuestion(q, index) {
  const str = (v, max) => String(v == null ? "" : v).trim().slice(0, max);
  const id = str(q && q.id, 80);
  if (!id) throw new Error(`Question #${index + 1} has no id.`);
  const text = str(q.text, 500);
  if (!text) throw new Error(`Question #${index + 1} has no text.`);
  const type = QUESTION_TYPES.includes(q.type) ? q.type : "text";
  const options =
    type === "single_choice"
      ? (Array.isArray(q.options) ? q.options : []).map((o) => str(o, 200)).filter(Boolean).slice(0, 20)
      : [];
  if (type === "single_choice" && options.length < 2) {
    throw new Error(`"${text}" is multiple choice — give it at least 2 options.`);
  }
  return {
    id,
    text,
    type,
    options,
    category: str(q.category, 80) || "custom",
    dependsOnId: str(q.dependsOnId, 80),
    dependsOnValue: q.dependsOnId ? str(q.dependsOnValue, 200) : "",
    active: q.active !== false,
    order: index + 1,
  };
}

/** Turns raw answers into a readable block for the OpenAI prompt. Skips blanks. */
export function buildAnswersSummary(questions, answers) {
  const byAnswerId = {};
  (answers || []).forEach((a) => (byAnswerId[a.questionId] = a.value));
  const lines = [];
  questions.forEach((q) => {
    const val = byAnswerId[q.id];
    if (val === undefined || val === null || String(val).trim() === "") return;
    lines.push(q.text + " — " + String(val).trim());
  });
  return lines.join("\n");
}

/** Keeps only answers to real, currently-known questions, attaching the question text. */
export function cleanAnswers(questions, rawAnswers) {
  const byId = {};
  questions.forEach((q) => (byId[q.id] = q));
  return (Array.isArray(rawAnswers) ? rawAnswers : [])
    .filter((a) => a && byId[a.questionId] !== undefined && a.value != null && String(a.value).trim() !== "")
    .map((a) => ({
      questionId: String(a.questionId),
      text: byId[a.questionId].text,
      value: String(a.value).trim().slice(0, 1000),
    }));
}
