/**
 * Feature Flags Management API
 *
 * GET  /api/settings/feature-flags          → list all flags for the tenant
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getAllFlags } from "@/lib/feature-flags";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (auth instanceof NextResponse) return auth;

    const flags = getAllFlags(auth.tenantId);
    return NextResponse.json({ flags });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
