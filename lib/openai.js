// OpenAI vision analysis — same prompt and JSON schema as the old Apps
// Script backend, called from the server only (the key never reaches the browser).

const ZONE_ENUM = ["upper-front", "upper-left", "upper-right", "lower-front", "lower-left", "lower-right"];

const CATEGORY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: { type: "integer", description: "0-100, higher = healthier" },
    severity: { type: "string", enum: ["none", "mild", "moderate", "severe"] },
    summary: {
      type: "string",
      description:
        "Two to three plain-language sentences. Be specific and concrete — name the actual " +
        "tooth/area/color/shade you are describing rather than speaking in generalities.",
    },
  },
  required: ["score", "severity", "summary"],
};

const ALIGNMENT_DETAIL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    crowdingZones: {
      type: "array",
      items: { type: "string", enum: ZONE_ENUM },
      description: "Zones with visibly crowded/overlapping teeth. Empty array if none.",
    },
    spacingZones: {
      type: "array",
      items: { type: "string", enum: ZONE_ENUM },
      description: "Zones with visible gaps/spacing between teeth. Empty array if none.",
    },
    biteNote: {
      type: "string",
      description: 'One sentence on bite/midline alignment if visible from the photos, else "Not clearly visible in photos."',
    },
    alignerCandidate: {
      type: "boolean",
      description:
        "True only if there is a genuine, visible alignment issue (crowding, spacing, rotation, " +
        "or bite misalignment) that clear aligners commonly treat. False for straight/healthy alignment — " +
        "do not default to true, and never suggest this for someone with no visible issue.",
    },
    alignerNote: {
      type: "string",
      description:
        "If alignerCandidate is true: one honest, non-pushy patient-facing sentence on why clear " +
        "aligners could be worth asking about. If false: empty string.",
    },
  },
  required: ["crowdingZones", "spacingZones", "biteNote", "alignerCandidate", "alignerNote"],
};

const ANALYSIS_JSON_SCHEMA = {
  name: "oral_health_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      overallScore: { type: "integer" },
      categories: {
        type: "object",
        additionalProperties: false,
        properties: {
          alignment: CATEGORY_SCHEMA,
          decayCavities: CATEGORY_SCHEMA,
          gumHealth: CATEGORY_SCHEMA,
          enamelWear: CATEGORY_SCHEMA,
          stainingColor: CATEGORY_SCHEMA,
        },
        required: ["alignment", "decayCavities", "gumHealth", "enamelWear", "stainingColor"],
      },
      alignmentDetail: ALIGNMENT_DETAIL_SCHEMA,
      patientSummary: {
        type: "string",
        description:
          "A warm, reassuring 3-5 sentence personal summary of this person's oral health, written " +
          'directly to them ("your..."). Blend what the photos show with what they reported (age, habits, ' +
          "symptoms). Lead with genuine positives, then the key things worth attention, and close by framing a " +
          "professional check-up as the natural next step. Calm and encouraging — never alarming.",
      },
      strengths: {
        type: "array",
        items: { type: "string" },
        description:
          '2-4 genuine positives you can actually see or infer (e.g. "Healthy pink gums on the upper arch"). ' +
          "Never invent positives.",
      },
      attentionAreas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string", description: 'Short label, e.g. "Lower front crowding".' },
            location: {
              type: "string",
              description:
                'Where, as specifically as the photo allows, e.g. "Upper-left molar, chewing surface". "General" if not location-specific.',
            },
            detail: { type: "string", description: "One or two calm, plain sentences on what was seen and why it matters." },
            urgency: { type: "string", enum: ["routine", "soon", "priority"] },
          },
          required: ["title", "location", "detail", "urgency"],
        },
        description: "Ordered most important first. Empty array if nothing needs attention.",
      },
      recommendedTreatments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            service: {
              type: "string",
              enum: [
                "Invisible Aligners",
                "Microscopic Root Canal Treatment",
                "Professional Cleaning & Scaling",
                "Teeth Whitening",
                "Tooth-coloured Fillings",
                "Crowns & Veneers (Smile Correction)",
                "Dental Implants",
                "Gum Care Treatment",
                "Routine Check-up",
              ],
            },
            reason: { type: "string", description: "One sentence tying this service to a specific finding for this person." },
            fit: { type: "string", enum: ["strong", "possible"] },
          },
          required: ["service", "reason", "fit"],
        },
        description:
          "Only services genuinely supported by the findings, strongest first, max 4. Always include " +
          '"Routine Check-up" if nothing else applies.',
      },
      habitInsights: {
        type: "array",
        items: { type: "string" },
        description:
          "2-4 short, practical, personalised tips drawn from their self-reported habits and answers " +
          "(e.g. switching to a soft brush, flossing, reducing tobacco). Friendly, never preachy.",
      },
      staffNote: {
        type: "string",
        description:
          "INTERNAL, clinic staff only (never shown to the patient): 2-3 sentences on the best " +
          "consultation angle for this lead — primary service opportunity, the concern most likely to motivate " +
          "them, and anything to be sensitive about.",
      },
      rootCanalRiskFlag: { type: "boolean" },
      rootCanalRiskNote: { type: "string" },
      detectedIssues: {
        type: "array",
        items: { type: "string" },
        description:
          "Specific, concrete findings. Whenever an issue applies to a particular tooth or area, " +
          'name it (e.g. "Dark spot on the chewing surface of an upper-left molar, consistent with early decay" ' +
          'rather than just "possible decay").',
      },
      recommendedProductTags: { type: "array", items: { type: "string" } },
      professionalAdviceNote: { type: "string" },
      photoQualityWarning: { type: ["string", "null"] },
    },
    required: [
      "overallScore", "categories", "alignmentDetail", "patientSummary", "strengths", "attentionAreas",
      "recommendedTreatments", "habitInsights", "staffNote", "rootCanalRiskFlag", "rootCanalRiskNote",
      "detectedIssues", "recommendedProductTags", "professionalAdviceNote", "photoQualityWarning",
    ],
  },
};

const SYSTEM_PROMPT =
  "CLINIC CONTEXT: You work for Amend Dental Centre (Kerala, India — branches in Calicut, " +
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
  'image (e.g. "upper-right, second tooth from center") — never just say "possible decay" with no location.\n' +
  "- Gum tissue: describe the actual gum color and texture you see (healthy gums are typically a consistent " +
  "coral/salmon pink) — note any redness, puffiness, recession, or dark/purple discoloration, and where.\n" +
  "- Enamel and wear: look for flattened or chipped edges, translucency at the tips, or rough texture.\n\n" +
  "Write each category summary as 2-3 concrete sentences — enough for the patient to understand exactly what " +
  "you saw and why you scored it that way. Avoid vague filler like \"looks generally okay\"; say what you " +
  'actually observed, even for healthy findings (e.g. "Gums are a healthy, even pink with no visible swelling ' +
  'or recession.").\n\n' +
  "Alignment detail: separately assess crowding and spacing by zone (upper/lower x left/right/front), note the " +
  "bite/midline if visible, and decide alignerCandidate honestly — true only for a real, visible alignment issue " +
  "aligners commonly address, false for straight or near-straight teeth.\n\n" +
  "You are NOT diagnosing disease and cannot replace an in-person dental exam, X-rays, or probing — say so via " +
  "professionalAdviceNote. If a photo is too blurry, dark, zoomed out, or doesn't show teeth clearly, say so in " +
  "photoQualityWarning and score conservatively rather than guessing. Only set rootCanalRiskFlag=true when there " +
  "is a clearly visible sign consistent with deep decay or a possibly dying/infected tooth that has NOT already " +
  "been treated — this should be rare, not a default. Keep language plain and patient-facing, but do not sacrifice " +
  "specificity or accuracy for brevity.";

async function readOpenAIError(res) {
  let msg = `OpenAI request failed (HTTP ${res.status}).`;
  try {
    const j = await res.json();
    if (j.error && j.error.message) msg = j.error.message;
  } catch {
    /* use generic message */
  }
  return msg;
}

/** photos = JPEG/PNG data URLs. Returns the parsed analysis object. */
export async function callOpenAIVision(photos, answersSummary, apiKey, model) {
  const imageContent = photos.map((dataUrl) => ({ type: "image_url", image_url: { url: dataUrl, detail: "high" } }));

  let introText = "Here are the photos for this oral health screening.";
  if (answersSummary) introText += "\n\nSelf-reported intake form:\n" + answersSummary;
  introText += "\n\nAnalyze all of this together and return the structured result.";

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + apiKey },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: [{ type: "text", text: introText }, ...imageContent] },
      ],
      response_format: { type: "json_schema", json_schema: ANALYSIS_JSON_SCHEMA },
      max_tokens: 2400,
    }),
    signal: AbortSignal.timeout(110_000),
  });

  if (!res.ok) throw new Error(await readOpenAIError(res));
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response.");
  return JSON.parse(content);
}

export async function testOpenAIKey(apiKey) {
  if (!apiKey) return { ok: false, error: "No API key set yet." };
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: "Bearer " + apiKey },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: await readOpenAIError(res) };
  } catch (err) {
    return { ok: false, error: "Couldn't reach OpenAI: " + err.message };
  }
}
