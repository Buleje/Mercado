import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { PlantasForestalesDB } from "@/lib/db/plantas-forestales.db";
import { inspeccionesQuerySchema } from "@/lib/superadmin/plantas-forestales/schemas";
import { listarTodas } from "@/lib/superadmin/plantas-forestales/inspeccion.server";

/**
 * GET /api/superadmin/plantas/inspecciones?estado&tenantId&incluirPrueba=1 —
 * las inspecciones de TODAS las plantas (`InspeccionResumen & { tenantId,
 * plantaNombre }`), la más reciente primero. Sin `incluirPrueba` quedan fuera
 * las plantas de prueba, como en la lista. Un `tenantId` que no es planta = 404.
 * (Este segmento estático gana a `[tenantId]`: «inspecciones» no es un id.)
 */
const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(req: NextRequest) {
  const limitado = applyRateLimit(req, "GENEROUS", "superadmin:plantas:inspecciones:todas");
  if (limitado) return limitado;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const q = inspeccionesQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  const { estado, tenantId, incluirPrueba } = q.data;

  try {
    const todas = await PlantasForestalesDB.listar();
    const plantas = tenantId
      ? todas.filter((p) => p.tenantId === tenantId)
      : todas.filter((p) => incluirPrueba === "1" || !p.esPrueba);
    if (tenantId && plantas.length === 0) return NextResponse.json({ error: "Planta no encontrada" }, { status: 404 });
    const inspecciones = plantas.length ? await listarTodas(plantas, { estado }) : [];
    return NextResponse.json({ inspecciones }, { headers: NO_STORE });
  } catch (err) {
    logger.error("[superadmin/plantas/inspecciones] GET", { error: String(err) });
    return NextResponse.json({ error: "No se pudieron leer las inspecciones" }, { status: 500 });
  }
}
