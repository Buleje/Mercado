/**
 * GET /api/superadmin/vendor-applications
 *
 * Lista aplicaciones filtradas por status. Solo superadmin. Guardado por
 * proxy.ts (guardSuperadminApi) pero validamos defense-in-depth.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  getPlatformSession,
  PLATFORM_SESSION,
} from "@/lib/superadmin-session";
import { VendorApplicationsDB } from "@/lib/db/vendor-applications.db";
import { toSuperadminView } from "@/lib/vendor/registration-mapper";
import type { ApplicationStatus } from "@/lib/db/vendor-applications.db";

const VALID_STATUSES: readonly ApplicationStatus[] = [
  "pending",
  "under_review",
  "info_requested",
  "approved",
  "tenant_provisioned",
  "rejected",
] as const;

export async function GET(req: NextRequest) {
  const platformToken = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!platformToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const session = await getPlatformSession(platformToken);
  if (!session) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const statusParam = req.nextUrl.searchParams.get("status");
  const status: ApplicationStatus | "all" =
    statusParam === null || statusParam === "all"
      ? "all"
      : (VALID_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as ApplicationStatus)
        : "all";

  const rows = await VendorApplicationsDB.listByStatus(status);
  return NextResponse.json({
    ok: true,
    applications: rows.map(toSuperadminView),
    count: rows.length,
  });
}
