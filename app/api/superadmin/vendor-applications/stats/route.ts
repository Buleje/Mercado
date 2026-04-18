/**
 * GET /api/superadmin/vendor-applications/stats
 *
 * KPIs agregados para el dashboard del superadmin.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getPlatformSession,
  PLATFORM_SESSION,
} from "@/lib/superadmin-session";
import { VendorApplicationsDB } from "@/lib/db/vendor-applications.db";

export async function GET(req: NextRequest) {
  const platformToken = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!platformToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = await getPlatformSession(platformToken);
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const stats = await VendorApplicationsDB.getStats();
  return NextResponse.json({ ok: true, stats });
}
