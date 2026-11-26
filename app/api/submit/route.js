import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { route, readJson, HttpError, str } from "@/lib/http";
import { connectDb } from "@/lib/db";
import { Analysis, Lead, Link } from "@/lib/models";
import { getAllQuestions } from "@/lib/data";
import { cleanAnswers } from "@/lib/questions";
import { computeSelfReportedRisk, computeRiskScore, classifyTemperature } from "@/lib/scoring";
import { uploadPhoto, deletePhotos, assertPhotoDataUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Saves the lead: uploads the photos to Bunny Storage (private) and stores the
 * lead in MongoDB. Safe to retry — the same analysisToken always returns
 * the same lead instead of creating a duplicate.
 */
export const POST = route(async (req) => {
  const body = await readJson(req);
  const analysisToken = str(body.analysisToken, 100);
  if (!analysisToken) throw new HttpError(400, "Missing analysis. Please upload your photos again.");

  await connectDb();
  const already = await Lead.findOne({ analysisToken }, { leadId: 1 }).lean();
  if (already) return NextResponse.json({ leadId: already.leadId });

  const cached = await Analysis.findOne({ token: analysisToken, status: "done" }).lean();
  if (!cached) throw new HttpError(410, "Your analysis has expired. Please upload your photos again.");

  const name = str(body.name, 120);
  const phone = str(body.phone, 40);
  const email = str(body.email, 200);
  if (!name || !phone) throw new HttpError(400, "Please enter your name and phone number.");

  const photos = (Array.isArray(body.photos) ? body.photos : []).filter(Boolean).slice(0, 3);
  photos.forEach((p) => {
    try {
      assertPhotoDataUrl(p);
    } catch (err) {
      throw new HttpError(400, err.message);
    }
  });

  const questions = await getAllQuestions();
  const answers = cleanAnswers(questions, body.answers);
  const selfReportedRisk = computeSelfReportedRisk(questions, answers);
  const riskScore = computeRiskScore(cached.analysis, selfReportedRisk, Boolean(phone || email));

  // A lead that arrives through a team user's share link belongs to that user.
  const refSource = str(body.refSource, 60) || "direct";
  const link = refSource !== "direct" ? await Link.findOne({ code: refSource }, { ownerId: 1 }).lean() : null;

  const leadId = randomBytes(8).toString("hex");
  const paths = await Promise.all(photos.map((p, i) => uploadPhoto(p, `${leadId}_${i + 1}`)));

  try {
    await Lead.create({
      leadId,
      analysisToken,
      name,
      phone,
      email,
      refSource,
      ownerId: link?.ownerId || null,
      photos: paths.map((path) => ({ path })),
      oralHealthScore: cached.oralHealthScore,
      analysis: cached.analysis,
      assessmentAnswers: answers,
      riskScore,
      temperature: classifyTemperature(riskScore),
      status: "new",
      notes: "",
    });
  } catch (err) {
    await deletePhotos(paths).catch(() => {});
    if (err.code === 11000) {
      // A parallel retry saved this same submission first — return that lead.
      const winner = await Lead.findOne({ analysisToken }, { leadId: 1 }).lean();
      if (winner) return NextResponse.json({ leadId: winner.leadId });
    }
    throw err;
  }

  await Analysis.deleteOne({ token: analysisToken }).catch(() => {});
  return NextResponse.json({ leadId });
});
