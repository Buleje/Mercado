import { NextRequest, NextResponse } from "next/server";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { withApiHandler } from "@/lib/api-handler";
import { ForestReporteDiarioDB } from "@/lib/db/forest-reporte-diario.db";
import { reporteDiarioSchema } from "@/lib/forestal/reporte-diario";
import { autorizarReportes, errorDeValidacion, errorInterno, leerJson, moduloApagado, SIN_CACHE } from "@/lib/forestal/reporte-diario-ruta";

/**
 * /api/admin/forestal/reportes-diarios/[id] (ADR-439)
 *
 * GET    → `{ reporte, envios }` (los últimos 20 intentos, de `NotificationLog`).
 * PUT    → reemplaza la configuración (`reporteDiarioSchema`).
 * DELETE → lo borra (el historial en `NotificationLog` queda).
 *
 * El `tenantId` va en el WHERE de cada query: el id de un reporte de otro
 * negocio da 404, no se lee ni se toca.
 *
 * Con el módulo CTP apagado: se puede ver, PAUSAR (un PUT con `activo: false`
 * sólo lo apaga, no guarda el resto) y borrar; activar o editar, no.
 */
type Ctx = { params: Promise<{ id: string }> };

const noExiste = () =>
  NextResponse.json({ error: "not_found", message: "Ese reporte no existe o ya se borró." }, { status: 404 });

export const GET = withApiHandler<Ctx>("forestal-reporte-diario-get", async (req: NextRequest, ctx: Ctx) => {
  const auth = await autorizarReportes(req, { exigirModulo: false });
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "reportes-diarios-leer");
  if (rl) return rl;
  const { id } = await ctx.params;
  try {
    const reporte = await ForestReporteDiarioDB.leer(auth.tenantId, id);
    if (!reporte) return noExiste();
    const envios = await ForestReporteDiarioDB.envios(auth.tenantId, id, 20);
    return NextResponse.json({ reporte, envios }, { headers: SIN_CACHE });
  } catch (err) {
    return errorInterno(err, "GET-id", auth.tenantId);
  }
});

export const PUT = withApiHandler<Ctx>("forestal-reporte-diario-put", async (req: NextRequest, ctx: Ctx) => {
  const auth = await autorizarReportes(req, { exigirModulo: false });
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "reportes-diarios");
  if (rl) return rl;
  const { id } = await ctx.params;
  const j = await leerJson(req);
  if (!j.ok) return j.res;
  const parsed = reporteDiarioSchema.safeParse(j.body);
  if (!parsed.success) return errorDeValidacion(parsed.error);
  if (!auth.moduloHabilitado && parsed.data.activo) {
    return moduloApagado("El módulo CTP está apagado: sólo puedes pausar o borrar este reporte.");
  }
  try {
    const reporte = auth.moduloHabilitado
      ? await ForestReporteDiarioDB.actualizar(auth.tenantId, id, parsed.data, auth.username)
      : await ForestReporteDiarioDB.pausar(auth.tenantId, id, auth.username);
    return reporte ? NextResponse.json({ reporte }) : noExiste();
  } catch (err) {
    return errorInterno(err, "PUT", auth.tenantId);
  }
});

export const DELETE = withApiHandler<Ctx>("forestal-reporte-diario-delete", async (req: NextRequest, ctx: Ctx) => {
  const auth = await autorizarReportes(req, { exigirModulo: false });
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "reportes-diarios");
  if (rl) return rl;
  const { id } = await ctx.params;
  try {
    const ok = await ForestReporteDiarioDB.eliminar(auth.tenantId, id, auth.username);
    return ok ? NextResponse.json({ ok: true }) : noExiste();
  } catch (err) {
    return errorInterno(err, "DELETE", auth.tenantId);
  }
});
