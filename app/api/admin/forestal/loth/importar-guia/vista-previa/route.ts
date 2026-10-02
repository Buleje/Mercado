import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { lothErrorResponse, lothValidationResponse } from "@/lib/forestal/loth-api-errors";
import { pedidoVistaPreviaSchema } from "@/lib/forestal/loth-importar-guia-esquemas";
import { cobrarConsultasSerfor, resolverFuentes } from "@/lib/forestal/loth-importar-guia-fuentes";
import { consultasSerforDe } from "@/lib/forestal/loth-importar-guia-esquemas";
import { ForestLothImportarDB } from "@/lib/db/forest-loth-importar.db";
import type { RespuestaVistaPrevia } from "@/lib/forestal/loth-importar-guia-tipos";

/**
 * POST /api/admin/forestal/loth/importar-guia/vista-previa — qué asentaría el
 * Libro TH con estas guías, SIN escribir (ADR-461). Cuerpo `PedidoVistaPrevia`:
 * `{ fuentes: [{ tipo: "serfor", numeroRegistro } | { tipo: "ctp", woodEntryId }
 * | { tipo: "ficha", ficha }], planes?: (planId | null)[] }`.
 *
 * Por guía (`GuiaVistaPrevia`): el permiso detectado (existente / nuevo /
 * ambiguo), las trozas, las talas referenciales, los avisos y el estado con y
 * sin talas. La revisión es la MISMA que corre al importar.
 *
 * Guard: requireAdmin (admin, almacenero, dueño: mirar no escribe) → rate
 * limit MODERATE → spec:forestal:loth-libro → hasta `IMPORTAR_SERFOR_POR_PEDIDO`
 * N° de registro, cada uno cobrado al límite de la consulta suelta a SERFOR.
 * Las fuentes se resuelven de a 3 a la vez (`resolverFuentes`).
 *
 * `maxDuration` 300 s (también en `vercel.json`, que manda sobre `app/api/**`):
 * 10 consultas a SERFOR de hasta 20 s cada una no entran en los 30 s de siempre.
 */
export const maxDuration = 300;
export const POST = withApiHandler("forestal-loth-importar-guia-vista-previa", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "MODERATE", "loth-importar-guia-vista");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json(
      { error: "specialization_disabled", message: "El Libro de Títulos Habilitantes no está habilitado para este negocio." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json", message: "El pedido no es un JSON válido." }, { status: 400 });
  }
  const parsed = pedidoVistaPreviaSchema.safeParse(body);
  if (!parsed.success) return lothValidationResponse(parsed.error);
  const cobro = cobrarConsultasSerfor(req, consultasSerforDe(parsed.data.fuentes));
  if (cobro) return cobro;

  try {
    const guias = await resolverFuentes(auth.tenantId, parsed.data.fuentes, parsed.data.planes ?? []);
    const respuesta: RespuestaVistaPrevia = { guias: await ForestLothImportarDB.vistaPrevia(auth.tenantId, guias) };
    return NextResponse.json(respuesta);
  } catch (err) {
    return lothErrorResponse(err, "loth-importar-guia.vista-previa", auth.tenantId);
  }
});
