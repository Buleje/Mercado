import { NextRequest, NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { ForestPlanDocumentosDB } from "@/lib/db/forest-plan-documentos.db";
import { PlanIdQuery, type RespuestaVista } from "@/lib/forestal/plan-documentos-tipos";
import { entrar, responderError } from "./_comun";

/**
 * /api/admin/forestal/plan/documentos — «Documentos del plan de manejo» (ADR-467).
 *
 * GET ?planId=X → { vista }  (carpetas, casilleros, lo que falta; sólo lee)
 *
 * Las escrituras viven en las subrutas, y todas devuelven la vista entera:
 *   POST  /preparar          { planId }                       → raíz + subcarpetas en el Drive
 *   POST  /carpetas          { planId, nombre, paraTodosLosPlanes }
 *   PATCH /carpetas          { planId, clave, nombre?, orden? }
 *   POST  /carpetas/adoptar  { planId, folderId, paraTodosLosPlanes }
 *   PATCH /plantilla?planId= { id, nombre?, orden?, activo?, renombrarEnPlanes }
 *   POST  /vincular          { planId, documentId, campoId | null }
 */
export const GET = withApiHandler("forestal-plan-documentos-get", async (req: NextRequest) => {
  const auth = await entrar(req, "leer");
  if (auth instanceof Response) return auth;

  const parsed = PlanIdQuery.safeParse({ planId: req.nextUrl.searchParams.get("planId") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const vista = await ForestPlanDocumentosDB.vista(auth.tenantId, parsed.data.planId);
    // `null` = el plan no es de ESTE negocio (el WHERE lleva tenantId): 404.
    if (!vista) {
      return NextResponse.json(
        { error: "plan_no_encontrado", message: "Ese plan de manejo no existe en este negocio." },
        { status: 404 },
      );
    }
    return NextResponse.json({ vista } satisfies RespuestaVista);
  } catch (err) {
    return responderError(err, "GET", auth.tenantId);
  }
});
