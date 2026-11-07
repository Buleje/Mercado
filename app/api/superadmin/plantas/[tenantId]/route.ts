import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { logger } from "@/lib/logger";
import { PlantasForestalesDB } from "@/lib/db/plantas-forestales.db";
import { fichaQuerySchema, tenantIdSchema } from "@/lib/superadmin/plantas-forestales/schemas";
import { resolverPeriodo } from "@/lib/superadmin/plantas-forestales/periodo";
import { armarFicha } from "@/lib/superadmin/plantas-forestales/resumen.server";

/**
 * GET /api/superadmin/plantas/[tenantId]?desde&hasta — la ficha de UNA planta:
 * resumen, existencia por especie, incoherencias, tendencia de 6 meses,
 * pendientes del libro e inspecciones. Un negocio que no es planta (sin el
 * libro CTP) da 404: el id se valida contra la lista, no contra la tabla de
 * tenants. Cada apertura queda en la auditoría del superadmin (`planta.ver`).
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest, ctx: { params: Promise<{ tenantId: string }> }) {
  const limitado = applyRateLimit(req, "GENEROUS", "superadmin:plantas:ficha");
  if (limitado) return limitado;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const id = tenantIdSchema.safeParse((await ctx.params).tenantId);
  if (!id.success) return NextResponse.json({ error: "Planta no encontrada" }, { status: 404 });
  const q = fichaQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  const periodo = resolverPeriodo(q.data);
  if (!periodo.ok) return NextResponse.json({ error: periodo.error }, { status: 400 });

  try {
    const planta = await PlantasForestalesDB.obtener(id.data);
    if (!planta) return NextResponse.json({ error: "Planta no encontrada" }, { status: 404 });
    const data = await armarFicha(planta, periodo.periodo);
    logSuperadminAction(
      "planta.ver",
      `Abrió la planta ${planta.nombre}`,
      { tenantId: planta.tenantId, desde: periodo.periodo.desde, hasta: periodo.periodo.hasta },
      auth.username,
    ).catch((err) => logger.error("[superadmin/plantas] auditoría planta.ver falló", { error: String(err) }));
    return NextResponse.json(data, { headers: NO_STORE });
  } catch (err) {
    logger.error("[superadmin/plantas/:id] GET", { tenantId: id.data, error: String(err) });
    return NextResponse.json({ error: "No se pudo leer la planta" }, { status: 500 });
  }
}
