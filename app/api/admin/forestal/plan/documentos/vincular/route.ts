import { NextRequest, NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { ForestPlanDocumentosDB } from "@/lib/db/forest-plan-documentos.db";
import { VincularArchivoBody, type RespuestaVista } from "@/lib/forestal/plan-documentos-tipos";
import { cuerpo, entrar, responderError } from "../_comun";

/**
 * POST /api/admin/forestal/plan/documentos/vincular
 *   { planId, documentId, campoId | null } → { vista }
 *
 * Mete un archivo del plan en un casillero (etiqueta `campo:<id>`; si el
 * casillero es de otra carpeta del plan, lo mueve ahí) o lo saca (`null`).
 */
async function vincular(req: NextRequest): Promise<Response> {
  const auth = await entrar(req, "escribir");
  if (auth instanceof Response) return auth;
  const body = await cuerpo(req, VincularArchivoBody);
  if (body instanceof NextResponse) return body;
  try {
    const vista = await ForestPlanDocumentosDB.vincularArchivo(auth.tenantId, body, auth.username ?? "unknown");
    return NextResponse.json({ vista } satisfies RespuestaVista);
  } catch (err) {
    return responderError(err, "vincular", auth.tenantId);
  }
}

export const POST = withApiHandler("forestal-plan-documentos-vincular", vincular);
/** Alias: es una edición del documento, así que también se acepta como PATCH. */
export const PATCH = withApiHandler("forestal-plan-documentos-vincular-patch", vincular);
