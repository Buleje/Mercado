import { NextRequest, NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { ForestReporteDiarioDB } from "@/lib/db/forest-reporte-diario.db";
import { DISPAROS_LIMA, horaExactaViva, reporteDiarioSchema } from "@/lib/forestal/reporte-diario";
import { autorizarReportes, errorDeValidacion, errorInterno, leerJson, SIN_CACHE } from "@/lib/forestal/reporte-diario-ruta";

/**
 * /api/admin/forestal/reportes-diarios — los reportes diarios del libro (ADR-439).
 *
 * GET  → `{ reportes, envios: { [id]: NotificationLog[] }, disparos, horaExacta, canales }`
 *        (`horaExacta` = el disparador de cada media hora llamó hace < 65 min).
 * POST → crea uno (`reporteDiarioSchema`).
 *
 * `requireAdmin` + rol explícito admin/dueño → CSRF en escrituras → rate limit
 * → guard `spec:forestal:ctp-libro` → `safeParse` → `auth.tenantId`.
 */

/** ¿El servidor tiene con qué mandar? Sólo presencia, nunca el valor. */
function canalesConfigurados() {
  return {
    correo: Boolean(process.env.RESEND_API_KEY),
    whatsapp: Boolean(process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_TOKEN),
  };
}

export const GET = withApiHandler("forestal-reportes-diarios-get", async (req: NextRequest) => {
  /* Ver la lista no pide el módulo: sin ella, un negocio que lo apagó no
     puede pausar ni borrar lo que le sigue llegando. */
  const auth = await autorizarReportes(req, { exigirModulo: false });
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "reportes-diarios-leer");
  if (rl) return rl;
  try {
    const reportes = await ForestReporteDiarioDB.listar(auth.tenantId);
    const [pares, latido] = await Promise.all([
      Promise.all(reportes.map(async (r) => [r.id, await ForestReporteDiarioDB.envios(auth.tenantId, r.id, 8)] as const)),
      /* Sin latido legible se promete la ventana de Vercel: prometer de menos, nunca de más. */
      ForestReporteDiarioDB.latidoHoraExacta().catch(() => null),
    ]);
    const envios = Object.fromEntries(pares);
    return NextResponse.json(
      {
        reportes,
        envios,
        disparos: DISPAROS_LIMA,
        horaExacta: horaExactaViva(latido, new Date()),
        canales: canalesConfigurados(),
        moduloHabilitado: auth.moduloHabilitado,
      },
      { headers: SIN_CACHE },
    );
  } catch (err) {
    return errorInterno(err, "GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-reportes-diarios-post", async (req: NextRequest) => {
  const auth = await autorizarReportes(req);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "reportes-diarios");
  if (rl) return rl;
  const j = await leerJson(req);
  if (!j.ok) return j.res;
  const parsed = reporteDiarioSchema.safeParse(j.body);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  try {
    const reporte = await ForestReporteDiarioDB.crear(auth.tenantId, parsed.data, auth.username);
    return NextResponse.json({ reporte }, { status: 201 });
  } catch (err) {
    return errorInterno(err, "POST", auth.tenantId);
  }
});
