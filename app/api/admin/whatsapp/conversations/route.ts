import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import {
  WhatsAppMessagesDB,
  listWhatsAppConfigs,
  getBotPausedPhones,
  getArchivedPhones,
  getLabelsMap,
} from "@/lib/db/whatsapp-messages.db";

/**
 * GET /api/admin/whatsapp/conversations — inbox WhatsApp del admin.
 * Lista de conversaciones agrupadas por cliente + números conectados del tenant.
 * ?phoneNumberId= filtra por número del negocio (multi-número, migración 311).
 */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "admin-whatsapp-inbox");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const rawFilter = req.nextUrl.searchParams.get("phoneNumberId");
  const filter = rawFilter && /^\d{1,50}$/.test(rawFilter) ? rawFilter : undefined;

  try {
    const [conversations, configs, pausedPhones, archivedPhones, labelsMap] =
      await Promise.all([
        WhatsAppMessagesDB.listConversations(auth.tenantId, filter),
        listWhatsAppConfigs(auth.tenantId),
        getBotPausedPhones(auth.tenantId),
        getArchivedPhones(auth.tenantId),
        getLabelsMap(auth.tenantId),
      ]);

    return NextResponse.json({
      conversations,
      pausedPhones,
      archivedPhones,
      labelsMap,
      numbers: configs.map((c) => ({
        id: c.id,
        label: c.label,
        phoneNumberId: c.phoneNumberId,
        businessName: c.businessName,
        isActive: c.isActive,
      })),
      connection: {
        connected: configs.length > 0,
        active: configs.some((c) => c.isActive),
      },
    });
  } catch (e) {
    logger.error("[admin/whatsapp/conversations] GET error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "Error de base de datos" }, { status: 503 });
  }
}
