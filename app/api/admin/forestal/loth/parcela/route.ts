import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothParcelaDB } from "@/lib/db/forest-loth-parcela.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { PLAN_ID_VALIDO, leerAlcanceGeo } from "@/lib/forestal/loth-alcance-geo";
import { hasParcela } from "@/lib/forestal/loth-geo";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/parcela — polígono del área de aprovechamiento del
 * Libro TH (geolocalización EUDR · Reglamento UE 2023/1115).
 *
 * GET — lee la parcela del tenant. ADR-462: una por permiso; sin `planId` es la del
 *       negocio. `?planId=X&solo=1` la de X; `?planId=X` la de X o, si no tiene, la
 *       del negocio con `heredada:true`; `?planId=sin-plan` la del negocio;
 *       `?todos=1` suma `porPermiso: [{ planId, parcela }]` de los planes vivos con área.
 * PUT — reemplaza la parcela { vertices: [[lat,lng]], nota, deforestacionCero, planId? }.
 *
 * Guard: requireAdmin → rate limit → spec:forestal:loth-libro.
 */

const putSchema = z.object({
  vertices: z
    .array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]))
    .max(500)
    .default([]),
  nota: z.string().trim().max(160).default(""),
  deforestacionCero: z.boolean().default(false),
  /** El permiso al que pertenece; sin él (o null) es la del negocio. */
  planId: z.string().regex(PLAN_ID_VALIDO).nullable().optional(),
});

/** Un permiso ajeno o dado de baja no se acepta: su clave quedaría huérfana, invisible para todo filtro. */
async function planInvalido(tenantId: string, planId: string | null | undefined) {
  if (!planId) return null;
  const plan = await ForestPlanDB.getPlan(tenantId, planId);
  return plan ? null : NextResponse.json({ error: "plan_not_found", message: "Ese permiso no existe en este negocio o fue dado de baja." }, { status: 404 });
}


async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-loth-parcela-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const lectura = leerAlcanceGeo(new URL(req.url).searchParams);
  if (!lectura.ok) return NextResponse.json({ error: "validation_error", message: lectura.mensaje }, { status: 400 });
  const { alcance } = lectura;

  try {
    if (alcance.tipo === "plan") {
      const propia = await ForestLothParcelaDB.get(auth.tenantId, alcance.planId);
      if (hasParcela(propia) || !alcance.heredar) return NextResponse.json({ parcela: propia, heredada: false, porPermiso: [] });
      return NextResponse.json({ parcela: await ForestLothParcelaDB.get(auth.tenantId), heredada: true, porPermiso: [] });
    }
    const parcela = await ForestLothParcelaDB.get(auth.tenantId);
    if (alcance.tipo === "todos") {
      const planes = await ForestPlanDB.listPlans(auth.tenantId);
      const porPermiso = await ForestLothParcelaDB.listarPorPlan(auth.tenantId, planes.map((p) => p.id).filter((id) => PLAN_ID_VALIDO.test(id)));
      return NextResponse.json({ parcela, heredada: false, porPermiso });
    }
    return NextResponse.json({ parcela, heredada: false, porPermiso: [] });
  } catch (err) {
    logger.error("[loth.parcela.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const PUT = withApiHandler("forestal-loth-parcela-put", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: parsed.error.issues[0]?.message, issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { planId, ...datos } = parsed.data;
  try {
    const ajeno = await planInvalido(auth.tenantId, planId);
    if (ajeno) return ajeno;
    const parcela = await ForestLothParcelaDB.set(auth.tenantId, datos, auth.username ?? "unknown", undefined, planId ?? null);
    return NextResponse.json({ parcela });
  } catch (err) {
    logger.error("[loth.parcela.PUT] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
