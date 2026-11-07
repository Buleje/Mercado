import { NextRequest, NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { ForestPlanDocumentosDB } from "@/lib/db/forest-plan-documentos.db";
import { PrepararBody, type RespuestaVista } from "@/lib/forestal/plan-documentos-tipos";
import { cuerpo, entrar, responderError } from "../_comun";

/**
 * POST /api/admin/forestal/plan/documentos/preparar { planId } → { vista }
 *
 * Crea (o re-etiqueta) la carpeta del plan en el Drive y sus subcarpetas; la
 * primera vez del negocio siembra además la plantilla sugerida. Idempotente.
 */
export const POST = withApiHandler("forestal-plan-documentos-preparar", async (req: NextRequest) => {
  const auth = await entrar(req, "escribir");
  if (auth instanceof Response) return auth;
  const body = await cuerpo(req, PrepararBody);
  if (body instanceof NextResponse) return body;
  try {
    const vista = await ForestPlanDocumentosDB.preparar(auth.tenantId, body.planId, auth.username ?? "unknown");
    return NextResponse.json({ vista } satisfies RespuestaVista);
  } catch (err) {
    return responderError(err, "preparar", auth.tenantId);
  }
});
