export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { BatchesDB } from "@/lib/db";

// ── GET /api/batches/stats ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const stats = await BatchesDB.getStats(auth.tenantId);
  return NextResponse.json(stats);
}
