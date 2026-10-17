import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { logger } from "@/lib/logger";
import { PlantasForestalesDB } from "@/lib/db/plantas-forestales.db";
import { ForestInspeccionPlantaDB } from "@/lib/db/forest-inspeccion-planta.db";
import { crearInspeccionSchema, tenantIdSchema } from "@/lib/superadmin/plantas-forestales/schemas";
import { crearInspeccion, errorDeInspeccion } from "@/lib/superadmin/plantas-forestales/inspeccion.server";

/**
 * Las inspecciones de UNA planta (fase 3 de «Plantas forestales», ADR-498).
 *
 *  · GET  → `{ inspecciones: InspeccionResumen[] }`, la más reciente primero.
 *  · POST `{ fecha: "AAAA-MM-DD", notas? }` → 201 con la inspección abierta,
 *    plana (`id`, `tenantId`, `libro`…): congela el libro de la planta en ese
 *    momento, SIN caché, con las trozas que su propio conteo de patio espera.
 *    Tarda unos segundos (lee todo el libro). Queda en la auditoría
 *    (`inspeccion.crear`).
 *
 * El `tenantId` se valida contra la lista de plantas: un negocio sin libro CTP
 * da 404 aunque exista. Sin sesión, 401 (antes que el CSRF: la pantalla manda
 * al login con 401, y un 403 sin sesión no le dice qué pasó).
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;
const NO_ES_PLANTA = { error: "Planta no encontrada" } as const;

export async function GET(req: NextRequest, ctx: { params: Promise<{ tenantId: string }> }) {
  const limitado = applyRateLimit(req, "GENEROUS", "superadmin:plantas:inspecciones:lista");
  if (limitado) return limitado;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const id = tenantIdSchema.safeParse((await ctx.params).tenantId);
  if (!id.success) return NextResponse.json(NO_ES_PLANTA, { status: 404 });
  try {
    const planta = await PlantasForestalesDB.obtener(id.data);
    if (!planta) return NextResponse.json(NO_ES_PLANTA, { status: 404 });
    const inspecciones = await ForestInspeccionPlantaDB.listar(planta.tenantId);
    return NextResponse.json({ inspecciones }, { headers: NO_STORE });
  } catch (err) {
    logger.error("[superadmin/plantas/:id/inspecciones] GET", { tenantId: id.data, error: String(err) });
    return NextResponse.json({ error: "No se pudieron leer las inspecciones" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ tenantId: string }> }) {
  const limitado = applyRateLimit(req, "MODERATE", "superadmin:plantas:inspecciones:crear");
  if (limitado) return limitado;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;

  const id = tenantIdSchema.safeParse((await ctx.params).tenantId);
  if (!id.success) return NextResponse.json(NO_ES_PLANTA, { status: 404 });
  const body = crearInspeccionSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Datos inválidos: manda la fecha como AAAA-MM-DD" }, { status: 400 });

  try {
    const planta = await PlantasForestalesDB.obtener(id.data);
    if (!planta) return NextResponse.json(NO_ES_PLANTA, { status: 404 });
    const inspeccion = await crearInspeccion(planta, {
      fecha: body.data.fecha,
      inspector: auth.username,
      notas: body.data.notas,
    });
    logSuperadminAction(
      "inspeccion.crear",
      `Abrió una inspección de la planta ${planta.nombre} (${inspeccion.fecha})`,
      { tenantId: planta.tenantId, inspeccionId: inspeccion.id, fecha: inspeccion.fecha },
      auth.username,
    ).catch((err) => logger.error("[superadmin/plantas] auditoría inspeccion.crear falló", { error: String(err) }));
    return NextResponse.json(inspeccion, { status: 201, headers: NO_STORE });
  } catch (err) {
    const e = errorDeInspeccion(err);
    if (e) return NextResponse.json(e.cuerpo, { status: e.status });
    logger.error("[superadmin/plantas/:id/inspecciones] POST", { tenantId: id.data, error: String(err) });
    return NextResponse.json({ error: "No se pudo abrir la inspección" }, { status: 500 });
  }
}
