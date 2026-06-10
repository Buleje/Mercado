import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";

/**
 * /api/admin/forestal/plan — Plan de Manejo Forestal (ADR-126)
 *
 * GET   — lista planes · ?active=1 → plan activo · ?planId=X → detalle (plan + especies + censo summary)
 * POST  — crea plan
 * PATCH — actualiza plan { id, ...campos }
 */

const planSchema = z.object({
  caratulaId: z.string().trim().min(1).nullable().optional(),
  planType: z.enum(["PMFI", "PO", "DEMA"]).optional(),
  planNumber: z.string().trim().max(120).nullable().optional(),
  tituloHabilitante: z.string().trim().max(120).nullable().optional(),
  resolucionNumber: z.string().trim().max(120).nullable().optional(),
  resolucionDate: z.coerce.date().nullable().optional(),
  titularName: z.string().trim().min(2).max(200),
  arffs: z.string().trim().max(160).nullable().optional(),
  region: z.string().trim().max(80).nullable().optional(),
  parcelaCorta: z.string().trim().max(120).nullable().optional(),
  areaHa: z.coerce.number().nonnegative().max(9999999).nullable().optional(),
  uitRef: z.coerce.number().nonnegative().max(999999).nullable().optional(),
  costoExtraccionM3: z.coerce.number().nonnegative().max(999999).nullable().optional(),
  costoTransformacionM3: z.coerce.number().nonnegative().max(999999).nullable().optional(),
  costoFleteM3: z.coerce.number().nonnegative().max(999999).nullable().optional(),
  vigenciaDesde: z.coerce.date().nullable().optional(),
  vigenciaHasta: z.coerce.date().nullable().optional(),
  estado: z.enum(["vigente", "vencido", "cerrado", "suspendido"]).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
const patchSchema = planSchema.partial().extend({ id: z.string().trim().min(1) });

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const url = new URL(req.url);
  try {
    const balanceId = url.searchParams.get("balance");
    if (balanceId) {
      return NextResponse.json({ balance: await ForestPlanDB.balanceExtraccion(auth.tenantId, balanceId) });
    }
    if (url.searchParams.get("analytics") === "1") {
      return NextResponse.json({ analytics: await ForestPlanDB.analytics(auth.tenantId, url.searchParams.get("planId") ?? undefined) });
    }
    const planId = url.searchParams.get("planId");
    if (planId) {
      const [plan, species, censusSummary] = await Promise.all([
        ForestPlanDB.getPlan(auth.tenantId, planId),
        ForestPlanDB.listSpecies(auth.tenantId, planId),
        ForestPlanDB.censusSummary(auth.tenantId, planId),
      ]);
      if (!plan) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ plan, species, censusSummary });
    }
    if (url.searchParams.get("active") === "1") {
      return NextResponse.json({ active: await ForestPlanDB.getActivePlan(auth.tenantId) });
    }
    return NextResponse.json({ plans: await ForestPlanDB.listPlans(auth.tenantId) });
  } catch (err) {
    logger.error("[plan.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const parsed = planSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  try {
    const plan = await ForestPlanDB.createPlan(auth.tenantId, { ...parsed.data, createdBy: auth.username ?? "unknown" });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (err) {
    logger.error("[plan.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
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
    const plan = await ForestPlanDB.updatePlan(auth.tenantId, id, patch);
    return NextResponse.json({ plan });
  } catch (err) {
    logger.error("[plan.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
