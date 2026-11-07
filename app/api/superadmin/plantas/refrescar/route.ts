import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { PlantasForestalesDB } from "@/lib/db/plantas-forestales.db";
import { refrescarSchema } from "@/lib/superadmin/plantas-forestales/schemas";
import { olvidarPlantas } from "@/lib/superadmin/plantas-forestales/resumen.server";

/**
 * POST /api/superadmin/plantas/refrescar `{ tenantId? }` — «Recalcular»:
 * olvida lo cacheado (5 min) de una planta o de todas; el próximo GET vuelve a
 * leer los libros. No escribe en la base.
 */
export async function POST(req: NextRequest) {
  const limitado = applyRateLimit(req, "STRICT", "superadmin:plantas:refrescar");
  if (limitado) return limitado;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const body = refrescarSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });

  try {
    const { tenantId } = body.data;
    if (tenantId && !(await PlantasForestalesDB.obtener(tenantId))) {
      return NextResponse.json({ error: "Planta no encontrada" }, { status: 404 });
    }
    olvidarPlantas(tenantId);
    return NextResponse.json({ ok: true, tenantId: tenantId ?? null });
  } catch (err) {
    logger.error("[superadmin/plantas/refrescar] POST", { error: String(err) });
    return NextResponse.json({ error: "No se pudo recalcular" }, { status: 500 });
  }
}
