import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothCierreDB } from "@/lib/db/forest-loth-cierre.db";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { monthRange } from "@/lib/forestal/loth-cierre-types";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { withApiHandler } from "@/lib/api-handler";

/**
 * /api/admin/forestal/loth/cierre — cierre de período del Libro TH.
 *
 * GET  — lista los períodos cerrados.
 * POST — { action:"cerrar", year, month } cierra el mes (calcula totales + graba);
 *        { action:"reabrir", periodKey, motivo } lo reabre (queda auditado).
 *
 * Bucket de rate-limit PROPIO ("loth-cierre") para no compartir cuota con el
 * resto del módulo (gotcha del cierre CTP: import/cierre se pisaban la cuota).
 */

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cerrar"),
    year: z.coerce.number().int().min(2000).max(2100),
    month: z.coerce.number().int().min(1).max(12),
  }),
  z.object({
    action: z.literal("reabrir"),
    periodKey: z.string().trim().regex(/^\d{4}-\d{2}$/, "periodKey inválido (YYYY-MM)"),
    motivo: z.string().trim().min(3).max(500),
  }),
]);

async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const GET = withApiHandler("forestal-loth-cierre-get", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "almacenero", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth-cierre");
  if (rl) return rl;
  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;
  try {
    return NextResponse.json({ cierres: await ForestLothCierreDB.list(auth.tenantId) });
  } catch (err) {
    logger.error("[loth.cierre.GET] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});

export const POST = withApiHandler("forestal-loth-cierre-post", async (req: NextRequest) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "STRICT", "loth-cierre");
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
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", message: parsed.error.issues[0]?.message, issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const user = auth.username ?? "unknown";

  try {
    if (parsed.data.action === "reabrir") {
      const cierres = await ForestLothCierreDB.reabrir(auth.tenantId, parsed.data.periodKey, parsed.data.motivo, user);
      return NextResponse.json({ cierres });
    }
    // cerrar: calcula el rango del mes + totales del acta, graba y bloquea.
    const { from, to, periodKey, label } = monthRange(parsed.data.year, parsed.data.month - 1);
    const existente = await ForestLothCierreDB.findByKey(auth.tenantId, periodKey);
    if (existente && !existente.reabierto) {
      return NextResponse.json({ error: "already_closed", message: `El período ${label} ya está cerrado.` }, { status: 409 });
    }
    const totales = await ForestLothDB.resumenPeriodo(auth.tenantId, from, to);
    const cierres = await ForestLothCierreDB.save(
      auth.tenantId,
      {
        periodKey,
        from: from.toISOString(),
        to: to.toISOString(),
        label,
        closedAt: new Date().toISOString(),
        closedBy: user,
        totales,
      },
      user,
    );
    return NextResponse.json({ cierres });
  } catch (err) {
    logger.error("[loth.cierre.POST] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error", message: err instanceof Error ? err.message : undefined }, { status: 500 });
  }
});
