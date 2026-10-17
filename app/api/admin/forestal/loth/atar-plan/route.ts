import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { atarSinPlanSchema } from "@/lib/forestal/loth-atar-sin-plan";
import { lothErrorResponse, lothValidationResponse } from "@/lib/forestal/loth-api-errors";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/atar-plan — atar al permiso las líneas del libro sin plan.
 *
 * Una línea sin `planId` cuenta en el saldo de TODOS los planes (ADR-459).
 *   GET                  → { total, cerradas }: cuántas hay (vivas, registradas) y cuántas
 *                          están en un mes cerrado.
 *   GET  ?planId=<id>    → vista previa (no escribe): por sección, a qué plan va cada una.
 *   POST { planId }      → las ata, en UNA transacción. La tala toma el permiso elegido;
 *                          trozado/despacho/consumo heredan el de su fuente. Los meses
 *                          cerrados no se tocan.
 * Cambia el saldo de un permiso: sólo admin/dueño (`requireAdmin` deja pasar al encargado).
 */

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-loth-atar-plan-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  try {
    const crudo = new URL(req.url).searchParams.get("planId")?.trim();
    if (!crudo) return NextResponse.json(await ForestLothDB.conteoAtarSinPlan(auth.tenantId));
    const parsed = atarSinPlanSchema.safeParse({ planId: crudo });
    if (!parsed.success) return lothValidationResponse(parsed.error);
    const vista = await ForestLothDB.atarSinPlan(auth.tenantId, parsed.data.planId, auth.username ?? "unknown", { simular: true });
    return NextResponse.json(vista);
  } catch (err) {
    return lothErrorResponse(err, "loth.atar-plan.GET", auth.tenantId);
  }
});

export const POST = withApiHandler("forestal-loth-atar-plan-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "atar líneas a un permiso");
  if (prohibido) return prohibido;
  const rl = await applyRateLimit(req, "STRICT", "loth-atar");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = atarSinPlanSchema.safeParse(body);
  if (!parsed.success) return lothValidationResponse(parsed.error);
  try {
    const r = await ForestLothDB.atarSinPlan(auth.tenantId, parsed.data.planId, auth.username ?? "unknown");
    return NextResponse.json(r);
  } catch (err) {
    return lothErrorResponse(err, "loth.atar-plan.POST", auth.tenantId);
  }
});
