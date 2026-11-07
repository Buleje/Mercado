import { NextRequest, NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { PlanIdQuery } from "@/lib/forestal/plan-documentos-tipos";
import { papelesDelPlan } from "@/lib/forestal/loth-plan-papeles-server";
import { limaDateKey } from "@/lib/utils";
import { entrar, responderError } from "../_comun";

/**
 * /api/admin/forestal/plan/documentos/papeles — «Papeles del permiso».
 *
 * GET ?planId=X → { lista, requeridos, presentes, vencidos, vencenPronto, faltan }
 *
 * Lo que la norma pide para ese tipo de plan contra lo que hay en sus carpetas
 * (ADR-467). Sólo lee; la pestaña lo calcula en el cliente con la vista que
 * ya tiene, esto es para quien no la tiene (el semáforo, el asistente).
 */
export const GET = withApiHandler("forestal-plan-papeles-get", async (req: NextRequest) => {
  const auth = await entrar(req, "leer");
  if (auth instanceof Response) return auth;
  const parsed = PlanIdQuery.safeParse({ planId: req.nextUrl.searchParams.get("planId") ?? undefined });
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  try {
    /* Con el rol: el almacenero no recibe el nombre de un papel con candado (security 25-10). */
    const r = await papelesDelPlan(auth.tenantId, parsed.data.planId, limaDateKey(), auth.role);
    if (!r) return NextResponse.json({ error: "plan_no_encontrado", message: "Ese plan de manejo no existe en este negocio." }, { status: 404 });
    return NextResponse.json({
      lista: r.lista,
      requeridos: r.requeridos,
      presentes: r.presentes,
      vencidos: r.vencidos,
      vencenPronto: r.vencenPronto,
      faltan: r.faltan,
    });
  } catch (err) {
    return responderError(err, "papeles.GET", auth.tenantId);
  }
});
