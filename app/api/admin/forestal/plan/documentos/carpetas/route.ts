import { NextRequest, NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { ForestPlanDocumentosDB } from "@/lib/db/forest-plan-documentos.db";
import { CarpetaEditarBody, CarpetaNuevaBody, type RespuestaVista } from "@/lib/forestal/plan-documentos-tipos";
import { cuerpo, entrar, responderError } from "../_comun";

/**
 * /api/admin/forestal/plan/documentos/carpetas
 *
 * POST  { planId, nombre, paraTodosLosPlanes } → { vista }  · 409 si ya hay una con ese nombre
 * PATCH { planId, clave, nombre?, orden? }     → { vista }  · renombra la carpeta de ESTE plan en el Drive
 */
export const POST = withApiHandler("forestal-plan-documentos-carpeta-crear", async (req: NextRequest) => {
  const auth = await entrar(req, "escribir");
  if (auth instanceof Response) return auth;
  const body = await cuerpo(req, CarpetaNuevaBody);
  if (body instanceof NextResponse) return body;
  try {
    const vista = await ForestPlanDocumentosDB.crearCarpeta(auth.tenantId, body, auth.username ?? "unknown");
    return NextResponse.json({ vista } satisfies RespuestaVista, { status: 201 });
  } catch (err) {
    return responderError(err, "carpetas.POST", auth.tenantId);
  }
});

export const PATCH = withApiHandler("forestal-plan-documentos-carpeta-editar", async (req: NextRequest) => {
  const auth = await entrar(req, "escribir");
  if (auth instanceof Response) return auth;
  const body = await cuerpo(req, CarpetaEditarBody);
  if (body instanceof NextResponse) return body;
  try {
    const vista = await ForestPlanDocumentosDB.editarCarpeta(auth.tenantId, body, auth.username ?? "unknown");
    return NextResponse.json({ vista } satisfies RespuestaVista);
  } catch (err) {
    return responderError(err, "carpetas.PATCH", auth.tenantId);
  }
});
