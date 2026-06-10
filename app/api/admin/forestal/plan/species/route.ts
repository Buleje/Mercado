import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/plan/species — Especies autorizadas del plan (ADR-126)
 * GET ?planId · POST (add) · PATCH { id } · DELETE ?id
 */

const addSchema = z.object({
  planId: z.string().trim().min(1),
  speciesCommon: z.string().trim().min(1).max(120),
  speciesScientific: z.string().trim().max(150).nullable().optional(),
  cites: z.boolean().optional(),
  categoria: z.string().trim().max(10).nullable().optional(),
  volumenAutorizadoM3: z.coerce.number().positive().max(9999999),
  arbolesAutorizados: z.coerce.number().int().nonnegative().max(999999).nullable().optional(),
  valorEstadoNaturalSoles: z.coerce.number().nonnegative().max(9999999).nullable().optional(),
  precioVentaSoles: z.coerce.number().nonnegative().max(9999999).nullable().optional(),
});
const patchSchema = addSchema.partial().omit({ planId: true }).extend({ id: z.string().trim().min(1) });

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
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json({ species: await ForestPlanDB.addSpecies(auth.tenantId, parsed.data) }, { status: 201 });
  } catch (err) {
    logger.error("[plan.species.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("forestal-plan-species-patch", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
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
    return NextResponse.json({ species: await ForestPlanDB.updateSpecies(auth.tenantId, id, patch) });
  } catch (err) {
    logger.error("[plan.species.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const DELETE = withApiHandler("forestal-plan-species-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    await ForestPlanDB.removeSpecies(auth.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[plan.species.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
