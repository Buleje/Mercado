import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { LiveSessionsDB } from "@/lib/db/live-sessions.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/lives/[id]/stats — stats en tiempo real de una live específica.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req, [
    "admin",
    "tienda_owner",
    "owner",
    "manager",
    "analista",
  ]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const stats = await LiveSessionsDB.getLiveStats(auth.tenantId, id);
    return NextResponse.json({ data: stats });
  } catch (err) {
    logger.error("[api/admin/lives/stats] GET failed", { err: String(err) });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
