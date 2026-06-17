import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { CampaignsDB } from "@/lib/db/campaigns.db";
import { sendWhatsAppQueued } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/campaigns-dispatch
 *
 * Despacha campañas de marketing por WhatsApp programadas (status="programada",
 * scheduledAt <= now, canal whatsapp|ambos). Expande la audiencia del segmento
 * (solo clientes con teléfono + notifPromotions=true → consentimiento Ley 29733),
 * encola un WhatsApp por cliente (personaliza {{nombre}}) y marca la campaña
 * como completada con sus métricas.
 *
 * Cierra el gap detectado en auditoría 2026-06-17: existían el modelo Campaign +
 * segmentos + estimateAudience, pero NADA despachaba — /campaigns/notify solo
 * creaba notificaciones in-app. Este cron hace el envío real.
 *
 * Autorización: Bearer <CRON_SECRET>. El envío saliente depende de
 * WHATSAPP_API_URL + WHATSAPP_API_TOKEN — sin ellos `sendWhatsAppQueued` es no-op.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const due = await CampaignsDB.listDueWhatsApp();
    let dispatched = 0;
    let messages = 0;

    for (const campaign of due) {
      const audience = await CampaignsDB.resolveAudience(campaign.tenantId, campaign.segment);
      for (const customer of audience) {
        // Personaliza {{nombre}} si la plantilla lo usa.
        const msg = campaign.message.replace(/\{\{\s*nombre\s*\}\}/gi, customer.name || "");
        void sendWhatsAppQueued(customer.phone, msg, {
          tenantId: campaign.tenantId,
          context: "campaign-broadcast",
          metadata: { campaignId: campaign.id },
        }).catch((err) =>
          logger.error("[cron/campaigns-dispatch] send failed", {
            error: String(err),
            campaignId: campaign.id,
          }),
        );
        messages++;
      }
      await CampaignsDB.markDispatched(campaign.tenantId, campaign.id, audience.length);
      dispatched++;
    }

    return NextResponse.json({ ok: true, dispatched, messages });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("[cron/campaigns-dispatch] error", { error: message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
