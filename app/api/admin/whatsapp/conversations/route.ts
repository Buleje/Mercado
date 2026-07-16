import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { WhatsAppMessagesDB, getWhatsAppConfig } from "@/lib/db/whatsapp-messages.db";

/**
 * GET /api/admin/whatsapp/conversations — inbox WhatsApp del admin.
 * Lista de conversaciones agrupadas por cliente + estado de conexión del número.
 */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "admin-whatsapp-inbox");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const [conversations, config] = await Promise.all([
      WhatsAppMessagesDB.listConversations(auth.tenantId),
      getWhatsAppConfig(auth.tenantId),
    ]);

    return NextResponse.json({
      conversations,
      connection: config
        ? {
            connected: true,
            active: config.isActive,
            phoneNumberId: config.phoneNumberId,
            businessName: config.businessName,
          }
        : { connected: false, active: false },
    });
  } catch (e) {
    logger.error("[admin/whatsapp/conversations] GET error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error de base de datos" }, { status: 503 });
  }
}
