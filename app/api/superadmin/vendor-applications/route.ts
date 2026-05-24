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
import { applyRateLimit } from "@/lib/rate-limit";

const VALID_STATUSES: readonly ApplicationStatus[] = [
  "pending",
  "under_review",
  "info_requested",
  "approved",
  "tenant_provisioned",
  "rejected",
] as const;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export async function GET(req: NextRequest) {
  // Rate limit defensivo — el endpoint puede listar hasta 500 filas y
  // dispara queries pesadas. Cap por IP para evitar abuse / scraping.
  const rl = await applyRateLimit(
    req,
    "GENEROUS",
    "superadmin-vendor-applications-list",
  );
  if (rl) return rl;

  const platformToken = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!platformToken) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }
  const session = await getPlatformSession(platformToken);
  if (!session) {
    return NextResponse.json(
      { error: "Invalid session" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const statusParam = req.nextUrl.searchParams.get("status");
  const status: ApplicationStatus | "all" =
    statusParam === null || statusParam === "all"
      ? "all"
      : (VALID_STATUSES as readonly string[]).includes(statusParam)
        ? (statusParam as ApplicationStatus)
        : "all";

  const rows = await VendorApplicationsDB.listByStatus(status);
  return NextResponse.json(
    {
      ok: true,
      applications: rows.map(toSuperadminView),
      count: rows.length,
    },
    { headers: NO_STORE_HEADERS },
  );
}
