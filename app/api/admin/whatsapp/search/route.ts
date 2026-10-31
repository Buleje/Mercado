import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { WhatsAppMessagesDB } from "@/lib/db/whatsapp-messages.db";

/**
 * GET /api/admin/whatsapp/search?q= — busca DENTRO de los mensajes de todas
 * las conversaciones ("¿quién me habló del arroz?"). Mín 3 caracteres.
 */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "admin-whatsapp-search");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 3) {
    return NextResponse.json({ results: [] });
  }

  try {
    const results = await WhatsAppMessagesDB.searchMessages(auth.tenantId, q);
    return NextResponse.json({ results });
  } catch (e) {
    logger.error("[admin/whatsapp/search] error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error de base de datos" }, { status: 503 });
  }
}
