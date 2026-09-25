import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ContratoAjenoError, ForestPlanDB } from "@/lib/db/forest-plan.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/plan — Plan de Manejo Forestal (ADR-126)
 *
 * GET    — lista planes · ?active=1 → plan activo · ?planId=X → detalle (plan + especies + censo summary)
 *          · ?planId=X&usos=1 → qué cuelga del plan (para el "¿estás seguro?" de la baja)
 * POST   — crea plan
 * PATCH  — actualiza plan { id, ...campos }
 * DELETE — ?id=X da de baja el plan (lógica: los asientos y las guías que lo
 *          citan siguen existiendo, son lo que se declara ante la ARFFS)
 */

const planSchema = z.object({
  caratulaId: z.string().trim().min(1).nullable().optional(),
  // Los cinco documentos de gestión que se registran desde la pantalla.
  // PGMF y PLANTACION faltaban: el formulario ofrecía tres siglas y el
  // catálogo normativo (lib/forestal/loth-tipos-plan.ts) tiene cinco.
  planType: z.enum(["PGMF", "PMFI", "PO", "DEMA", "PLANTACION"]).optional(),
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
  // Regente forestal (ADR-423): firma el informe de ejecución junto al
  // titular y está inscrito en el Registro Nacional de Regentes de SERFOR.
  regenteName: z.string().trim().max(200).nullable().optional(),
  regenteRegistro: z.string().trim().max(60).nullable().optional(),
  regenteEspecialidad: z.enum(["maderable", "no_maderable", "plantaciones"]).nullable().optional(),
  representanteLegal: z.string().trim().max(200).nullable().optional(),
  // Cómo se reconoce y dónde queda (ADR-426). Ninguno es un casillero del
  // formato oficial: son los datos con los que se ubica el papel en la oficina.
  alias: z.string().trim().max(120).nullable().optional(),
  propietarioNombre: z.string().trim().max(200).nullable().optional(),
  propietarioDocTipo: z.enum(["RUC", "DNI", "CE", "PASAPORTE"]).nullable().optional(),
  propietarioDoc: z.string().trim().max(20).nullable().optional(),
  provincia: z.string().trim().max(80).nullable().optional(),
  distrito: z.string().trim().max(80).nullable().optional(),
  sector: z.string().trim().max(120).nullable().optional(),
  cuenca: z.string().trim().max(120).nullable().optional(),
  contratoId: z.string().trim().max(40).nullable().optional(),
});
const patchSchema = planSchema.partial().extend({ id: z.string().trim().min(1) });

async function ensureSpec(tenantId: string) {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-plan-get", async (req: NextRequest) => {
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
    // Antes del detalle: lo que la pantalla necesita para decir QUÉ se pierde
    // de vista al dar de baja el plan, sin traerse el censo entero.
    if (planId && url.searchParams.get("usos") === "1") {
      const plan = await ForestPlanDB.getPlan(auth.tenantId, planId);
      if (!plan) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ usos: await ForestPlanDB.usosDelPlan(auth.tenantId, planId) });
    }
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
});

export const POST = withApiHandler("forestal-plan-post", async (req: NextRequest) => {
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
    if (err instanceof ContratoAjenoError) {
      return NextResponse.json({ error: "contrato_ajeno", message: err.message }, { status: 400 });
    }
    logger.error("[plan.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PATCH = withApiHandler("forestal-plan-patch", async (req: NextRequest) => {
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
    if (err instanceof ContratoAjenoError) {
      return NextResponse.json({ error: "contrato_ajeno", message: err.message }, { status: 400 });
    }
    logger.error("[plan.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

const deleteSchema = z.object({ id: z.string().trim().min(1) });

export const DELETE = withApiHandler("forestal-plan-delete", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const url = new URL(req.url);
  const parsed = deleteSchema.safeParse({ id: url.searchParams.get("id") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const plan = await ForestPlanDB.eliminarPlan(auth.tenantId, parsed.data.id, auth.username ?? "unknown");
    // `null` = no existe EN ESTE tenant (el WHERE lleva tenantId): 404, no 403,
    // y nunca un update a ciegas sobre el id de otro.
    if (!plan) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, plan });
  } catch (err) {
    logger.error("[plan.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
