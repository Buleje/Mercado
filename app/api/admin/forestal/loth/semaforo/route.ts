import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestContratoDB } from "@/lib/db/forest-contrato.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { semaforoDelLibro } from "@/lib/forestal/loth-plan-semaforo-libro";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/semaforo — lo que el semáforo del plan necesita del
 * libro y la pantalla no tiene (`loth-plan-semaforo-libro`):
 *
 *   · plazos: despachos sin asentar y asientos tardíos de la semana — con las
 *     MISMAS líneas y guías que el aviso de plazos (`datosAvisoPlazos`), así la
 *     campana y el semáforo cuentan igual;
 *   · por plan, cuántos árboles talados o trozados dicen quién los taló;
 *   · los motosierristas ya escritos (el último primero), para el formulario
 *     de tala y trozado;
 *   · el RUC o DNI del titular de cada plan, que vive en su permiso: sólo si el
 *     negocio tiene los permisos (`spec:forestal:ctp-libro`, el mismo candado
 *     que `GET /contratos`); si no, la ficha lo cuenta como faltante.
 *
 * GET → SemaforoDelLibro. Sólo lectura: cifras y nombres, ni volúmenes ni
 * guías. Guard igual que la lectura del libro: requireAdmin (los mismos roles
 * que `GET /loth`) → rate limit con bucket propio → spec:forestal:loth-libro.
 */
export const GET = withApiHandler("forestal-loth-semaforo", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth-semaforo");
  if (rl) return rl;

  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  try {
    const [datos, permisos] = await Promise.all([
      ForestLothDB.datosAvisoPlazos(auth.tenantId),
      permisosDelTenant(auth.tenantId),
    ]);
    return NextResponse.json(semaforoDelLibro(datos, Date.now(), permisos));
  } catch (err) {
    logger.error("[loth.semaforo.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

/** Los permisos, sólo con su candado; un fallo acá no tumba el semáforo. */
async function permisosDelTenant(tenantId: string) {
  try {
    if (!(await isSpecializationEnabled(tenantId, "spec:forestal:ctp-libro"))) return [];
    return await ForestContratoDB.list(tenantId);
  } catch (err) {
    logger.warn("[loth.semaforo.GET] permisos failed", { error: String(err), tenantId });
    return [];
  }
}
