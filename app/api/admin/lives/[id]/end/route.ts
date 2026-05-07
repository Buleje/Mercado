import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { LiveSessionsDB } from "@/lib/db/live-sessions.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/admin/lives/[id]/end — transición live → ended.
 * Calcula durationSeconds + agregados (viewers, messages, orders, gmv).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-lives-X-end"); if (_rl) return _rl;
  const auth = await requireAdmin(req, [
    "admin",
    "tienda_owner",
    "owner",
    "manager",
  ]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const session = await LiveSessionsDB.endLive(auth.tenantId, id);
    return NextResponse.json({ data: session });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("[api/admin/lives/end] failed", { err: msg });
    if (msg.includes("not in live")) {
      return NextResponse.json({ error: msg }, { status: 409 });
    }
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
