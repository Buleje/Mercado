import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothDB, LOTH_SECTIONS } from "@/lib/db/forest-loth.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { PLAN_ID_VALIDO } from "@/lib/forestal/loth-alcance-geo";
import { lothErrorResponse, lothValidationResponse } from "@/lib/forestal/loth-api-errors";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/borrar-del-plan — borrar las operaciones de UN plan
 * de manejo (Brandon 07-10-2026: «eliminar todas las operaciones de ese plan,
 * sea tala, trozado, despacho»).
 *
 *   GET  ?planId=<id>              → { total, m3, secciones[] }: cuántas líneas
 *                                    tiene el plan por sección y cuántas caen en
 *                                    un mes cerrado. No escribe.
 *   POST { planId, secciones[] }   → las borra (soft) en UNA transacción. Las de
 *                                    mes cerrado, las que ya están en el Libro
 *                                    CTP y las que dejarían a otra colgando se
 *                                    saltan y se devuelven con su motivo.
 *
 * Borra datos del libro: sólo admin/dueño. El plan tiene que ser del negocio
 * del JWT (si no, 404 sin tocar nada).
 */

const planIdSchema = z.string().trim().regex(PLAN_ID_VALIDO, "El plan de manejo no es válido.");
const getSchema = z.object({ planId: planIdSchema });
const postSchema = z.object({
  planId: planIdSchema,
  secciones: z.array(z.enum(LOTH_SECTIONS)).min(1, "Elige al menos una sección.").max(LOTH_SECTIONS.length),
});

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

const planAjeno = () =>
  NextResponse.json(
    { error: "plan_not_found", message: "Ese plan de manejo no existe en este negocio o fue dado de baja." },
    { status: 404 },
  );

export const GET = withApiHandler("forestal-loth-borrar-del-plan-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "borrar las operaciones de un plan");
  if (prohibido) return prohibido;
  const rl = applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const parsed = getSchema.safeParse({ planId: new URL(req.url).searchParams.get("planId") ?? "" });
  if (!parsed.success) return lothValidationResponse(parsed.error);
  try {
    if (!(await ForestPlanDB.getPlan(auth.tenantId, parsed.data.planId))) return planAjeno();
    return NextResponse.json(await ForestLothDB.contarDelPlan(auth.tenantId, parsed.data.planId));
  } catch (err) {
    return lothErrorResponse(err, "loth.borrar-del-plan.GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-loth-borrar-del-plan-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "borrar las operaciones de un plan");
  if (prohibido) return prohibido;
  const rl = applyRateLimit(req, "STRICT", "loth-borrar-plan");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return lothValidationResponse(parsed.error);
  try {
    if (!(await ForestPlanDB.getPlan(auth.tenantId, parsed.data.planId))) return planAjeno();
    const r = await ForestLothDB.softDeleteDelPlan(
      auth.tenantId,
      parsed.data.planId,
      parsed.data.secciones,
      auth.username ?? "unknown",
    );
    return NextResponse.json(r);
  } catch (err) {
    return lothErrorResponse(err, "loth.borrar-del-plan.POST", auth.tenantId);
  }
});
