export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { BatchesDB } from "@/lib/db";

// ── GET /api/batches/expired ──────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const rl = applyRateLimit(req, "GENEROUS", "batches-expired");
  if (rl) return rl;

  try {
    const batches = await BatchesDB.getExpiredWithStock(auth.tenantId);
    return NextResponse.json({ data: batches });
  } catch {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
