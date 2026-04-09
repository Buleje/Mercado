/**
 * Feature Flags Management API
 *
 * GET  /api/settings/feature-flags          → list all flags for the tenant
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { getAllFlags } from "@/lib/feature-flags";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const flags = getAllFlags(auth.tenantId);
  return NextResponse.json({ flags });
}
