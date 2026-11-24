import { NextResponse } from "next/server";
import { route, requireAdmin, readJson, str } from "@/lib/http";
import { Setting } from "@/lib/models";
import { getSettings, publicSettings, verifyAdminPassword, hashPassword } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Change admin username and/or password (password change needs the current password). */
export const POST = route(async (req) => {
  await requireAdmin();
  const body = await readJson(req);
  const s = await getSettings();
  const set = {};
  const errors = [];

  const newUsername = str(body.newUsername, 120);
  if (newUsername) set.adminUsername = newUsername;

  const newPassword = String(body.newPassword || "").trim();
  if (newPassword) {
    if (!(await verifyAdminPassword(s, body.currentPassword))) {
      errors.push("Current password is incorrect — password was not changed.");
    } else if (newPassword.length < 8) {
      errors.push("New password must be at least 8 characters — password was not changed.");
    } else {
      set.adminPasswordHash = await hashPassword(newPassword);
    }
  }

  if (Object.keys(set).length) await Setting.updateOne({ key: "app" }, { $set: set });
  return NextResponse.json({ settings: await publicSettings(), errors: errors.length ? errors : null });
});
