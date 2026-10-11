import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { SettingsDB } from "@/lib/db/settings.db";
import { AjusteAsistenteSchema, CLAVE_ASISTENTE } from "@/lib/whatsapp/asistente-negocio";
import { responderComoAsesora } from "@/lib/whatsapp/concierge/handlers/asesora.handler";

/**
 * POST /api/admin/whatsapp/asistente/probar — el dueño le escribe a su
 * asistente como si fuera una clienta y ve qué contestaría. No manda nada por
 * WhatsApp ni guarda mensajes; sirve aunque la asistente esté apagada.
 */

const ROLES = ["admin", "owner", "tienda_owner"] as const;

const BodySchema = z.object({
  mensaje: z.string().trim().min(1).max(500),
  historial: z
    .array(z.object({ rol: z.enum(["clienta", "negocio"]), texto: z.string().max(1500) }))
    .max(10)
    .optional(),
});

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "MODERATE", "whatsapp-asistente-probar");
  if (rl) return rl;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const body = BodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Escribe el mensaje de prueba (hasta 500 letras)." }, { status: 400 });
  }
  try {
    const flags = await SettingsDB.getFeatureFlags(auth.tenantId);
    const ajuste = AjusteAsistenteSchema.safeParse(flags[CLAVE_ASISTENTE]);
    if (!ajuste.success) {
      return NextResponse.json({ error: "Primero guarda la asistente de WhatsApp." }, { status: 409 });
    }
    // Gasta del mismo tope de IA del negocio; el registro lo marca como prueba.
    const r = await responderComoAsesora(auth.tenantId, ajuste.data, body.data.mensaje, body.data.historial ?? [], "prueba");
    return NextResponse.json(r);
  } catch (err) {
    logger.error("[whatsapp/asistente/probar] POST", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo probar la asistente." }, { status: 500 });
  }
}
