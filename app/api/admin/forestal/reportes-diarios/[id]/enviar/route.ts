import { NextRequest, NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimitWithTenant } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { ForestReporteDiarioDB } from "@/lib/db/forest-reporte-diario.db";
import { enviarReporteDiario, reservarEnvioManual } from "@/lib/forestal/reporte-diario-envio";
import { TOPE_ENVIAR_AHORA_DIA } from "@/lib/forestal/reporte-diario";
import { autorizarReportes, errorInterno } from "@/lib/forestal/reporte-diario-ruta";

/**
 * POST /api/admin/forestal/reportes-diarios/[id]/enviar — «Enviar ahora» (ADR-439).
 *
 * Manda el reporte YA a los destinatarios GUARDADOS (nunca a los que vengan en
 * el cuerpo: esta ruta no puede servir para mandar mensajes a cualquier número
 * desde la cuenta del negocio). No toca la llave del envío programado: el de
 * hoy a su hora sale igual. Cada intento queda en `NotificationLog`.
 *
 * Topes (revisión de seguridad 26-09), todos contados en `NotificationLog`
 * —la base, no la memoria del proceso—:
 *  · `TOPE_ENVIAR_AHORA_DIA` «Enviar ahora» por reporte y día de Lima (429);
 *  · `TOPE_MENSAJES_DIA` mensajes por negocio y día, programados incluidos
 *    (`TopeDiarioError` → 429);
 *  · y el rate limit por IP/negocio de siempre, como primera barrera.
 */
type Ctx = { params: Promise<{ id: string }> };

export const POST = withApiHandler<Ctx>("forestal-reporte-diario-enviar", async (req: NextRequest, ctx: Ctx) => {
  const auth = await autorizarReportes(req);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimitWithTenant(req, "MODERATE", auth.tenantId, "reporte-diario-enviar", { maxReqs: 20, windowSec: 60 * 60 });
  if (rl) return rl;
  const { id } = await ctx.params;
  try {
    const reporte = await ForestReporteDiarioDB.leer(auth.tenantId, id);
    if (!reporte) {
      return NextResponse.json({ error: "not_found", message: "Ese reporte no existe o ya se borró." }, { status: 404 });
    }
    const ahora = new Date();
    if (!(await reservarEnvioManual(auth.tenantId, id, ahora, auth.username))) {
      return NextResponse.json(
        {
          error: "tope_enviar_ahora",
          message: `Ya usaste los ${TOPE_ENVIAR_AHORA_DIA} «Enviar ahora» de hoy para este reporte. Mañana vuelves a tenerlos.`,
        },
        { status: 429 },
      );
    }
    const { asunto, resultados } = await enviarReporteDiario(auth.tenantId, reporte, {
      ahora,
      motivo: "manual",
      usuario: auth.username,
    });
    return NextResponse.json({ asunto, resultados, enviados: resultados.filter((r) => r.ok).length, total: resultados.length });
  } catch (err) {
    return errorInterno(err, "enviar", auth.tenantId);
  }
});
