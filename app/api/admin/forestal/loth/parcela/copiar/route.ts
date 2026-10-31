import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothParcelaDB } from "@/lib/db/forest-loth-parcela.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { PLAN_ID_VALIDO, GEO_SIN_PLAN } from "@/lib/forestal/loth-alcance-geo";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * POST /api/admin/forestal/loth/parcela/copiar — «Pasar a este permiso» (ADR-462).
 *
 * Copia el área del negocio a la clave del permiso `{ planId }`. NUNCA pisa:
 *   · 201 { parcela }                       → copiada;
 *   · 409 { error: "ya_tiene_area" }        → el permiso ya tiene la suya;
 *   · 404 { error: "sin_area_del_negocio" } → no hay nada que copiar;
 *   · 404 { error: "plan_not_found" }       → permiso ajeno o dado de baja.
 * Roles: los del PUT de la parcela.
 */

const bodySchema = z.object({ planId: z.string().regex(PLAN_ID_VALIDO).refine((v) => v !== GEO_SIN_PLAN, "El permiso no es válido.") });

export const POST = withApiHandler("forestal-loth-parcela-copiar", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", message: parsed.error.issues[0]?.message, issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const plan = await ForestPlanDB.getPlan(auth.tenantId, parsed.data.planId);
    if (!plan) {
      return NextResponse.json({ error: "plan_not_found", message: "Ese permiso no existe en este negocio o fue dado de baja." }, { status: 404 });
    }
    const r = await ForestLothParcelaDB.copiarDelNegocio(auth.tenantId, parsed.data.planId, auth.username ?? "unknown");
    if (r.ok) return NextResponse.json({ parcela: r.parcela }, { status: 201 });
    if (r.motivo === "ya_tiene_area") {
      return NextResponse.json({ error: "ya_tiene_area", message: "Ese permiso ya tiene su área: no se pisa." }, { status: 409 });
    }
    return NextResponse.json({ error: "sin_area_del_negocio", message: "El negocio no tiene un área dibujada para pasar." }, { status: 404 });
  } catch (err) {
    logger.error("[loth.parcela.copiar] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
