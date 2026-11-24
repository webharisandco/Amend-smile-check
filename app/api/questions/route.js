import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { getAllQuestions } from "@/lib/data";

export const dynamic = "force-dynamic";

/** All active questions, in order — every visitor answers the same set. */
export const GET = route(async () => {
  const questions = (await getAllQuestions()).filter((q) => q.active);
  return NextResponse.json({ questions });
});
