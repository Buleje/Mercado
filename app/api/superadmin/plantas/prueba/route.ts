import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAPI } from "@/lib/superadmin-auth";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logSuperadminAction } from "@/lib/audit/superadmin-audit";
import { logger } from "@/lib/logger";
import { PlantasForestalesDB } from "@/lib/db/plantas-forestales.db";
import { pruebaSchema } from "@/lib/superadmin/plantas-forestales/schemas";

/**
 * PATCH /api/superadmin/plantas/prueba `{ tenantId, esPrueba }` — marca una
 * planta como de prueba (QA, demo): sale de la lista y de los totales salvo
 * con «incluir prueba». Sólo toca la lista guardada en la configuración de la
 * plataforma, nunca el negocio. Queda en la auditoría (`planta.prueba`).
 */
export async function PATCH(req: NextRequest) {
  const limitado = applyRateLimit(req, "MODERATE", "superadmin:plantas:prueba");
  if (limitado) return limitado;
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requirePlatformAPI(req);
  if (auth instanceof NextResponse) return auth;

  const body = pruebaSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { tenantId, esPrueba } = body.data;

  try {
    const planta = await PlantasForestalesDB.obtener(tenantId);
    if (!planta) return NextResponse.json({ error: "Planta no encontrada" }, { status: 404 });
    /* Sólo cambia QUIÉN entra en la lista (`marcarPrueba` limpia la lista):
       los números de cada planta no dependen de la marca y siguen cacheados. */
    const r = await PlantasForestalesDB.marcarPrueba(planta, esPrueba, auth.username);
    logSuperadminAction(
      "planta.prueba",
      `${esPrueba ? "Marcó" : "Desmarcó"} la planta ${planta.nombre} como de prueba`,
      { tenantId, esPrueba, antes: planta.esPrueba },
      auth.username,
    ).catch((err) => logger.error("[superadmin/plantas] auditoría planta.prueba falló", { error: String(err) }));
    return NextResponse.json({ ok: true, tenantId, esPrueba: r.esPrueba });
  } catch (err) {
    logger.error("[superadmin/plantas/prueba] PATCH", { tenantId, error: String(err) });
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}
