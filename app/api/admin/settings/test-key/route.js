import { NextResponse } from "next/server";
import { route, readJson, str } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { getSettings, openaiKeyOf } from "@/lib/data";
import { testOpenAIKey } from "@/lib/openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Tests the key typed in the box, or the saved key if the box is empty. */
export const POST = route(async (req) => {
  await requireSession();
  const body = await readJson(req);
  const key = str(body.openaiApiKey, 300) || openaiKeyOf(await getSettings());
  return NextResponse.json(await testOpenAIKey(key));
});
