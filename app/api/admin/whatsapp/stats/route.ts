import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { WhatsAppMessagesDB } from "@/lib/db/whatsapp-messages.db";

/**
 * GET /api/admin/whatsapp/stats — mini-dashboard del día (zona Lima):
 * recibidos, respondidos (bot vs humano), chats activos, tiempo de respuesta.
 */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "admin-whatsapp-stats");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const stats = await WhatsAppMessagesDB.statsToday(auth.tenantId);
    return NextResponse.json(stats);
  } catch (e) {
    logger.error("[admin/whatsapp/stats] error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error de base de datos" }, { status: 503 });
  }
}
