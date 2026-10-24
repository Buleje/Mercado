import { NextRequest, NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { ForestPlanDocumentosDB } from "@/lib/db/forest-plan-documentos.db";
import { AdoptarCarpetaBody, type RespuestaVista } from "@/lib/forestal/plan-documentos-tipos";
import { cuerpo, entrar, responderError } from "../../_comun";

/**
 * POST /api/admin/forestal/plan/documentos/carpetas/adoptar
 *   { planId, folderId, paraTodosLosPlanes } → { vista }
 *
 * Una subcarpeta hecha a mano en el Drive, dentro de la carpeta del plan, pasa
 * a la plantilla (de todos los planes o sólo de éste).
 */
export const POST = withApiHandler("forestal-plan-documentos-carpeta-adoptar", async (req: NextRequest) => {
  const auth = await entrar(req, "escribir");
  if (auth instanceof Response) return auth;
  const body = await cuerpo(req, AdoptarCarpetaBody);
  if (body instanceof NextResponse) return body;
  try {
    const vista = await ForestPlanDocumentosDB.adoptarCarpeta(auth.tenantId, body, auth.username ?? "unknown");
    return NextResponse.json({ vista } satisfies RespuestaVista);
  } catch (err) {
    return responderError(err, "carpetas.adoptar", auth.tenantId);
  }
});
