import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import {
  getWhatsAppConfig,
  getConfigForPhoneNumberId,
} from "@/lib/db/whatsapp-messages.db";
import { getApprovedTemplates } from "@/lib/whatsapp/templates";

/**
 * GET /api/admin/whatsapp/templates?phoneNumberId= — plantillas aprobadas del
 * número (Meta Graph, cache 5 min). Para responder fuera de la ventana de 24h.
 *
 * needsWabaId=true cuando el número no tiene WABA ID configurado — la UI guía
 * a completarlo en Bot WhatsApp.
 */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "MODERATE", "admin-whatsapp-templates");
  if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const rawPnid = req.nextUrl.searchParams.get("phoneNumberId");
  const pnid = rawPnid && /^\d{1,50}$/.test(rawPnid) ? rawPnid : undefined;

  try {
    const config = pnid
      ? await getConfigForPhoneNumberId(auth.tenantId, pnid)
      : await getWhatsAppConfig(auth.tenantId);
    if (!config) {
      return NextResponse.json({ templates: [], needsWabaId: false, connected: false });
    }

    const fallbackToken =
      process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_API_TOKEN || "";
    const templates = await getApprovedTemplates(config, fallbackToken);
    if (templates === null) {
      return NextResponse.json({ templates: [], needsWabaId: true, connected: true });
    }
    return NextResponse.json({ templates, needsWabaId: false, connected: true });
  } catch (e) {
    logger.error("[admin/whatsapp/templates] GET error", {
      tenantId: auth.tenantId,
      err: e instanceof Error ? e.message : String(e),
    });
    return NextResponse.json({ error: "No se pudieron cargar las plantillas" }, { status: 502 });
  }
}
