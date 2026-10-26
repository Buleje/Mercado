import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { enmascararCorreo } from "@/lib/avisos-correo-tipos";
import { enmascararTelefono } from "@/lib/asistente/mandar-papel";
import { telefonoParaWa } from "@/lib/whatsapp/aviso-plantilla";
import { viaDelWhatsAppDelNegocio } from "@/lib/whatsapp-tenant";
import { baseDelPanel, correoDelChequeoDeHoy, destinoDelCorreoChequeo } from "@/lib/forestal/loth-chequeo-correo-server";
import { armarCorreoChequeo, URL_AVISOS_CORREO } from "@/lib/forestal/loth-chequeo-correo";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * GET /api/admin/forestal/loth/chequeo/correo — la vista previa del correo del
 * chequeo del Libro TH (cron `loth-chequeo-correo`, 07:00 de Lima) para el
 * negocio de la sesión: el asunto, el HTML y a qué correo llega (enmascarado),
 * y a qué celular le llega por WhatsApp (la campana del panel sale siempre).
 * NO envía ni toca el registro de lo avisado.
 *
 * El HTML es el que saldría con lo nuevo; si todo ya se avisó, el de todo lo
 * de hoy (para que se vea igual); si no hay nada, el que lo dice.
 *
 * Sólo admin y dueño (`soloAdminODueno`: `requireAdmin` deja pasar al
 * encargado): el correo nombra los papeles del plan, que tienen candado.
 * `tenantId` sale del JWT. Bucket de rate limit propio: corre el chequeo entero.
 */
export const GET = withApiHandler("forestal-loth-chequeo-correo", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "ver el correo del chequeo");
  if (prohibido) return prohibido;

  const rl = applyRateLimit(req, "MODERATE", "loth-chequeo-correo");
  if (rl) return rl;

  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  try {
    const destino = await destinoDelCorreoChequeo(auth.tenantId);
    const [d, via] = await Promise.all([
      correoDelChequeoDeHoy(auth.tenantId, destino.negocio),
      destino.telefono ? viaDelWhatsAppDelNegocio(auth.tenantId, "loth_chequeo") : Promise.resolve(null),
    ]);
    const correo =
      d.correo ??
      armarCorreoChequeo({ negocio: destino.negocio, avisos: d.plan.avisos, checks: d.chequeo.checks, sinLeer: d.chequeo.sinLeer, base: baseDelPanel() });
    const motivo = !destino.correo
      ? "falta el correo del negocio"
      : !destino.activo
        ? "los avisos forestales por correo están apagados"
        : d.plan.nuevos.length === 0
          ? d.plan.avisos.length > 0
            ? "ya te avisé todo lo de hoy"
            : "no hay nada que pueda multarte"
          : null;
    return NextResponse.json({
      asunto: correo.asunto,
      html: correo.html,
      destino: enmascararCorreo(destino.correo),
      celular: destino.telefono ? enmascararTelefono(telefonoParaWa(destino.telefono)) : null,
      whatsappListo: via != null,
      sale: motivo == null,
      motivo,
      avisos: d.plan.avisos.length,
      nuevos: d.plan.nuevos.length,
      sinLeer: d.chequeo.sinLeer,
      hoy: d.chequeo.hoy,
      urlAvisos: URL_AVISOS_CORREO,
    });
  } catch (err) {
    logger.error("[loth.chequeo.correo.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
