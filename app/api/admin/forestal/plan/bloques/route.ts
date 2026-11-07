/**
 * El reparto por bloque o zona de las especies de un plan (Brandon 24-10).
 *
 *   GET ?planId=  → { bloques, updatedAt, updatedBy }   (admin, almacenero, dueño)
 *   PUT { planId, bloques } → { bloques, cambio }        (admin y dueño)
 *
 * Es el DETALLE de dónde está cada especie: el saldo sigue en las especies del
 * plan (`plan/species`) y este reparto no lo toca. Por eso escribe quien puede
 * cambiar lo registrado (admin y dueño, como `plan/species`); el encargado lo ve.
 * `bloques: []` borra el reparto.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestPlanBloquesDB } from "@/lib/db/forest-plan-bloques.db";
import { bloquesDelPlanSchema } from "@/lib/forestal/loth-plan-bloques";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";

const putSchema = z.object({ planId: z.string().trim().min(1).max(64), bloques: bloquesDelPlanSchema }).strict();

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-plan-bloques-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  const planId = new URL(req.url).searchParams.get("planId")?.trim();
  if (!planId) return NextResponse.json({ error: "planId_required" }, { status: 400 });
  try {
    if (!(await ForestPlanDB.getPlan(auth.tenantId, planId))) {
      return NextResponse.json({ error: "plan_no_encontrado" }, { status: 404 });
    }
    const reparto = await ForestPlanBloquesDB.leer(auth.tenantId, planId);
    return NextResponse.json({ bloques: reparto?.bloques ?? [], updatedAt: reparto?.updatedAt ?? null, updatedBy: reparto?.updatedBy ?? null });
  } catch (err) {
    logger.error("[plan.bloques.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PUT = withApiHandler("forestal-plan-bloques-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloAdminODueno(auth.role, "repartir las especies del plan por bloque");
  if (prohibido) return prohibido;
  const rl = applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    const primero = parsed.error.issues.find((i) => i.code === "custom")?.message;
    return NextResponse.json({ error: "validation_error", message: primero, issues: parsed.error.issues }, { status: 400 });
  }
  try {
    // El plan tiene que ser de este negocio: el planId suelto no dice de quién es.
    if (!(await ForestPlanDB.getPlan(auth.tenantId, parsed.data.planId))) {
      return NextResponse.json({ error: "plan_no_encontrado" }, { status: 404 });
    }
    const r = await ForestPlanBloquesDB.guardar(auth.tenantId, parsed.data.planId, parsed.data.bloques, auth.username ?? "unknown");
    return NextResponse.json({ bloques: r.reparto?.bloques ?? [], updatedAt: r.reparto?.updatedAt ?? null, cambio: r.cambio });
  } catch (err) {
    logger.error("[plan.bloques.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
