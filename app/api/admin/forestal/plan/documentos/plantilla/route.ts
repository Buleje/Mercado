import { NextRequest, NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { ForestPlanDocumentosDB } from "@/lib/db/forest-plan-documentos.db";
import { PlanIdQuery, PlantillaCarpetaPatch, type RespuestaVista } from "@/lib/forestal/plan-documentos-tipos";
import { cuerpo, entrar, responderError } from "../_comun";

/**
 * PATCH /api/admin/forestal/plan/documentos/plantilla[?planId=X]
 *   { id, nombre?, orden?, activo?, renombrarEnPlanes } → { vista } | { plantilla }
 *
 * Edita una carpeta de la PLANTILLA del negocio (todos los planes). El cuerpo
 * del contrato no trae plan, así que el plan cuya vista se devuelve va en la
 * query: con `?planId=` responde `{ vista }` (como toda escritura de la
 * sección); sin él, `{ plantilla }` con la fila editada.
 */
export const PATCH = withApiHandler("forestal-plan-documentos-plantilla", async (req: NextRequest) => {
  const auth = await entrar(req, "escribir");
  if (auth instanceof Response) return auth;
  const planIdCrudo = req.nextUrl.searchParams.get("planId");
  const plan = planIdCrudo == null ? null : PlanIdQuery.safeParse({ planId: planIdCrudo });
  if (plan && !plan.success) {
    return NextResponse.json({ error: "validation_error", issues: plan.error.issues }, { status: 400 });
  }
  const body = await cuerpo(req, PlantillaCarpetaPatch);
  if (body instanceof NextResponse) return body;
  try {
    const plantilla = await ForestPlanDocumentosDB.editarPlantillaCarpeta(auth.tenantId, body, auth.username ?? "unknown");
    // `null` = esa carpeta de la plantilla no es de este negocio (tenantId en el WHERE).
    if (!plantilla) {
      return NextResponse.json(
        { error: "carpeta_no_encontrada", message: "Esa carpeta no está en la plantilla de este negocio." },
        { status: 404 },
      );
    }
    if (!plan) return NextResponse.json({ plantilla });
    const vista = await ForestPlanDocumentosDB.vista(auth.tenantId, plan.data.planId);
    if (!vista) {
      return NextResponse.json(
        { error: "plan_no_encontrado", message: "Ese plan de manejo no existe en este negocio." },
        { status: 404 },
      );
    }
    return NextResponse.json({ vista } satisfies RespuestaVista);
  } catch (err) {
    return responderError(err, "plantilla", auth.tenantId);
  }
});
