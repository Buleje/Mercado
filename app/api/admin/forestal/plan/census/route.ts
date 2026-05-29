import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";

/**
 * /api/admin/forestal/plan/census — Censo forestal (ADR-126)
 *
 * GET   ?treeCode=X  → lookup de un árbol (autocompletado de Tala)
 * GET   ?planId=X    → lista del censo (?search, ?estado)
 * POST              → agrega árbol  ·  POST ?bulk=1 con { planId, rows[] } → import masivo
 * PATCH { id }       → actualiza árbol
 * DELETE ?id         → soft delete
 */

const treeSchema = z.object({
  planId: z.string().trim().min(1),
  treeCode: z.string().trim().min(1).max(60),
  speciesCommon: z.string().trim().min(1).max(120),
  speciesScientific: z.string().trim().max(150).nullable().optional(),
  cites: z.boolean().optional(),
  dapM: z.coerce.number().positive().max(99).nullable().optional(),
  alturaComercialM: z.coerce.number().positive().max(999).nullable().optional(),
  factorForma: z.coerce.number().positive().max(1).nullable().optional(),
  volumenEstimadoM3: z.coerce.number().nonnegative().max(99999).nullable().optional(),
  utmZona: z.string().trim().max(10).nullable().optional(),
  utmX: z.coerce.number().nullable().optional(),
  utmY: z.coerce.number().nullable().optional(),
  parcelaCorta: z.string().trim().max(120).nullable().optional(),
  calidad: z.string().trim().max(60).nullable().optional(),
  estado: z.enum(["en_pie", "talado", "descartado"]).optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});
const patchSchema = treeSchema.partial().omit({ planId: true }).extend({ id: z.string().trim().min(1) });
const bulkSchema = z.object({
  planId: z.string().trim().min(1),
  rows: z.array(treeSchema.omit({ planId: true })).min(1).max(2000),
});

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
    const treeCode = url.searchParams.get("treeCode");
    if (treeCode) {
      return NextResponse.json({ tree: await ForestPlanDB.getTreeByCode(auth.tenantId, treeCode) });
    }
    const planId = url.searchParams.get("planId");
    if (!planId) return NextResponse.json({ error: "planId_required" }, { status: 400 });
    const { trees, total } = await ForestPlanDB.listTrees(auth.tenantId, planId, {
      estado: url.searchParams.get("estado") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
    });
    return NextResponse.json({ trees, total });
  } catch (err) {
    logger.error("[plan.census.GET] failed", { error: String(err), tenantId: auth.tenantId });
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

  if (new URL(req.url).searchParams.get("bulk") === "1") {
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
    try {
      const res = await ForestPlanDB.bulkImportTrees(auth.tenantId, parsed.data.planId, parsed.data.rows, auth.username ?? "unknown");
      return NextResponse.json(res, { status: 201 });
    } catch (err) {
      logger.error("[plan.census.bulk] failed", { error: String(err), tenantId: auth.tenantId });
      return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
    }
  }

  const parsed = treeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json({ tree: await ForestPlanDB.addTree(auth.tenantId, { ...parsed.data, createdBy: auth.username ?? "unknown" }) }, { status: 201 });
  } catch (err) {
    logger.error("[plan.census.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error", message: String(err) }, { status: 500 });
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
    return NextResponse.json({ tree: await ForestPlanDB.updateTree(auth.tenantId, id, patch) });
  } catch (err) {
    logger.error("[plan.census.PATCH] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  try {
    await ForestPlanDB.softDeleteTree(auth.tenantId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[plan.census.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
