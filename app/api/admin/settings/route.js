import { NextResponse } from "next/server";
import { route, readJson, str } from "@/lib/http";
import { requireSession } from "@/lib/session";
import { Setting } from "@/lib/models";
import { getSettings, publicSettings } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await requireSession();
  return NextResponse.json({ settings: await publicSettings() });
});

/** Brand name, OpenAI key and model. A blank key field keeps the current key. */
export const PUT = route(async (req) => {
  await requireSession();
  const body = await readJson(req);
  await getSettings(); // make sure the document exists
  const set = {};
  if (str(body.brandName)) set.brandName = str(body.brandName);
  if (str(body.openaiApiKey, 300)) set.openaiApiKey = str(body.openaiApiKey, 300);
  if (body.clearOpenaiKey === true) set.openaiApiKey = "";
  if (str(body.openaiModel, 80)) set.openaiModel = str(body.openaiModel, 80);
  if (Object.keys(set).length) await Setting.updateOne({ key: "app" }, { $set: set });
  return NextResponse.json({ settings: await publicSettings() });
});
