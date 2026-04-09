import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { BatchesDB } from "@/lib/db";

// ── GET /api/batches/stats ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const rl = applyRateLimit(req, "GENEROUS", "batches-stats");
  if (rl) return rl;

  try {
    const stats = await BatchesDB.getStats(auth.tenantId);
    return NextResponse.json(stats);
  } catch {
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
