import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { route, readJson, HttpError, str } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { Analysis } from "@/lib/models";
import { getSettings, openaiKeyOf, getAllQuestions } from "@/lib/data";
import { buildAnswersSummary } from "@/lib/questions";
import { computeOralHealthScore } from "@/lib/scoring";
import { callOpenAIVision } from "@/lib/openai";
import { assertPhotoDataUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // the AI analysis usually takes 20–40 seconds

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs the AI analysis on the 3 photos + answers. Safe to retry: phones on
 * mobile data sometimes lose the response even though the work succeeded,
 * so a retry with the same requestId returns the original result instead
 * of paying for OpenAI twice.
 */
export const POST = route(async (req) => {
  const body = await readJson(req);
  const photos = Array.isArray(body.photos) ? body.photos.filter(Boolean) : [];
  if (photos.length < 3) throw new HttpError(400, "Please upload all 3 photos before analyzing.");
  photos.slice(0, 3).forEach((p) => {
    try {
      assertPhotoDataUrl(p);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
  });

  const settings = await getSettings();
  const apiKey = openaiKeyOf(settings);
  if (!apiKey) {
    throw new HttpError(503, "OpenAI API key is not set yet. Go to Admin → Settings to add it.", "openai_not_configured");
  }

  await connectDb();
  const requestId = str(body.requestId, 100) || randomUUID();

  // Claim this requestId, or wait for whoever already claimed it.
  let mine = false;
  for (let i = 0; i < 75 && !mine; i++) {
    const existing = await Analysis.findOne({ requestId }).lean();
    if (existing && existing.status === "done") return NextResponse.json(clientResult(existing));
    if (!existing) {
      try {
        await Analysis.create({ requestId });
        mine = true;
        break;
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
    await sleep(1500); // the first attempt is still running
  }
  if (!mine) throw new HttpError(504, "This is taking longer than usual. Please try again.");

  try {
    const questions = await getAllQuestions();
    const answersSummary = buildAnswersSummary(questions, Array.isArray(body.answers) ? body.answers : []);
    const analysis = await callOpenAIVision(photos.slice(0, 3), answersSummary, apiKey, settings.openaiModel || "gpt-4o");
    const oralHealthScore = computeOralHealthScore(analysis);
    const token = randomUUID();
    const saved = await Analysis.findOneAndUpdate(
      { requestId },
      { status: "done", token, analysis, oralHealthScore },
      { new: true, lean: true }
    );
    return NextResponse.json(clientResult(saved));
  } catch (err) {
    await Analysis.deleteOne({ requestId, status: "pending" }).catch(() => {});
    throw new HttpError(502, err.message || "The AI analysis failed. Please try again.");
  }
});

// The browser only needs the token to submit later — the full analysis
// (including the internal staff note) stays on the server.
function clientResult(doc) {
  return { analysisToken: doc.token, oralHealthScore: doc.oralHealthScore };
}
