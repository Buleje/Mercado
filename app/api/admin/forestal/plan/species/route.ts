import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { EspecieNoEncontradaError, EspecieRepetidaError, ForestPlanDB, PlanNoEncontradoError } from "@/lib/db/forest-plan.db";
import { especieDelPlanSchema } from "@/lib/forestal/loth-plan-especie";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";
import { soloAdminODueno } from "@/lib/forestal/plata-de-guia-rol";

/**
 * /api/admin/forestal/plan/species — Especies autorizadas del plan (ADR-126)
 * GET ?planId · POST (add) · PATCH { id } · DELETE ?id
 *
 * Plantación (ADR-459): `anioInstalacion` (1900–2100) y `superficieHa` (≥ 0),
 * los dos opcionales y `null` = no se sabe. La misma especie (por clave) dos
 * veces en el plan → 409 `especie_repetida`.
 */

/** Los campos son los del alta del plan (`especieDelPlanSchema`): una sola definición. */
const addSchema = especieDelPlanSchema.extend({ planId: z.string().trim().min(1) });
/**
 * Sin `.default()` en el esquema base a propósito: en Zod 4 `.partial()` aplica
 * los defaults y un PATCH de un solo campo pisaría los demás.
 */
const patchSchema = especieDelPlanSchema.partial().extend({ id: z.string().trim().min(1) });

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-plan-species-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  const planId = new URL(req.url).searchParams.get("planId");
  if (!planId) return NextResponse.json({ error: "planId_required" }, { status: 400 });
  try {
    return NextResponse.json({ species: await ForestPlanDB.listSpecies(auth.tenantId, planId) });
  } catch (err) {
    logger.error("[plan.species.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-plan-species-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  // El volumen de la especie es el techo de T6: el encargado no lo cambia (`requireAdmin` lo deja pasar).
  const prohibido = soloAdminODueno(auth.role, "agregar una especie al plan");
  if (prohibido) return prohibido;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json({ species: await ForestPlanDB.addSpecies(auth.tenantId, parsed.data, auth.username ?? "unknown") }, { status: 201 });
  } catch (err) {
    // El WHERE lleva el tenantId: un plan de otro negocio es «no existe», nunca 403.
    if (err instanceof PlanNoEncontradoError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof EspecieRepetidaError) {
      return NextResponse.json({ error: "especie_repetida", message: err.message }, { status: 409 });
    }
    logger.error("[plan.species.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("forestal-plan-species-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  // El volumen de la especie es el techo de T6: el encargado no lo cambia (`requireAdmin` lo deja pasar).
  const prohibido = soloAdminODueno(auth.role, "corregir una especie del plan");
  if (prohibido) return prohibido;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  try {
    const { id, ...patch } = parsed.data;
    return NextResponse.json({ species: await ForestPlanDB.updateSpecies(auth.tenantId, id, patch, auth.username ?? "unknown") });
  } catch (err) {
    if (err instanceof EspecieNoEncontradaError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (err instanceof EspecieRepetidaError) {
      return NextResponse.json({ error: "especie_repetida", message: err.message }, { status: 409 });
    }
    logger.error("[plan.species.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-plan-species-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  // El volumen de la especie es el techo de T6: el encargado no lo cambia (`requireAdmin` lo deja pasar).
  const prohibido = soloAdminODueno(auth.role, "quitar una especie del plan");
  if (prohibido) return prohibido;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    await ForestPlanDB.removeSpecies(auth.tenantId, id, auth.username ?? "unknown");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof EspecieNoEncontradaError) return NextResponse.json({ error: "not_found" }, { status: 404 });
    logger.error("[plan.species.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
