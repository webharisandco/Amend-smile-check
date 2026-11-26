import { NextResponse } from "next/server";
import { route, readJson, HttpError } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { connectDb } from "@/lib/db";
import { Question } from "@/lib/models";
import { getAllQuestions } from "@/lib/data";
import { normalizeQuestion } from "@/lib/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireSession();
  return NextResponse.json({ questions: await getAllQuestions() });
});

/** Replaces the whole question list (the editor always saves everything at once). */
export const PUT = route(async (req) => {
  await requireSession();
  const body = await readJson(req);
  if (!Array.isArray(body.questions)) throw new HttpError(400, "No questions sent.");
  if (!body.questions.length) throw new HttpError(400, "Keep at least one question — untick “Active” to hide one instead.");

  let questions;
  try {
    questions = body.questions.slice(0, 100).map(normalizeQuestion);
  } catch (err) {
    throw new HttpError(400, err.message);
  }
  const ids = new Set();
  for (const q of questions) {
    if (ids.has(q.id)) throw new HttpError(400, `Two questions share the id "${q.id}".`);
    ids.add(q.id);
  }
  // A dependency must point at an earlier question that still exists.
  questions.forEach((q, i) => {
    if (q.dependsOnId && !questions.slice(0, i).some((p) => p.id === q.dependsOnId)) {
      q.dependsOnId = "";
      q.dependsOnValue = "";
    }
  });

  await connectDb();
  await Question.bulkWrite([
    { deleteMany: { filter: { id: { $nin: [...ids] } } } },
    ...questions.map((q) => ({ replaceOne: { filter: { id: q.id }, replacement: q, upsert: true } })),
  ]);
  return NextResponse.json({ ok: true, questions: await getAllQuestions() });
});
