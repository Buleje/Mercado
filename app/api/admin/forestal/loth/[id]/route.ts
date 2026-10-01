import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { logger } from "@/lib/logger";
import { isSpecializationEnabled } from "@/lib/specializations";
import { withApiHandler } from "@/lib/api-handler";
import { lothErrorResponse } from "@/lib/forestal/loth-api-errors";

/**
 * /api/admin/forestal/loth/[id]
 *
 * PATCH  — anular entry (subsanación SERFOR: visible, no se borra). { reason }
 * DELETE — soft delete (solo errores de captura del sistema)
 */

const patchSchema = z.object({
  action: z.literal("annul"),
  reason: z.string().trim().min(3).max(500),
});

/**
 * Anular o borrar la tala de un árbol lo devuelve «en pie» en el censo —el
 * espejo de lo que hace el alta, que lo marca «talado»—. Sin esto el árbol
 * quedaba talado para siempre sin una sola línea que lo respalde (medido
 * 28-09 en QA: QA-MAPA-3 «talado» en el censo, 0 talas vigentes). Sólo si
 * no queda otra tala vigente del mismo código y el censo lo tiene talado.
 * Fire-and-forget: el libro ya quedó bien; esto sólo alinea el censo.
 */
function liberarArbolSiCorresponde(tenantId: string, linea: { section: string; treeCode: string | null }) {
  const code = linea.treeCode?.trim();
  if (linea.section !== "tala" || !code) return;
  (async () => {
    if (await ForestLothDB.tieneTalaVigente(tenantId, code)) return;
    const arbol = await ForestPlanDB.getTreeByCode(tenantId, code);
    if (arbol?.estado === "talado") await ForestPlanDB.markTreeStatusByCode(tenantId, code, "en_pie");
  })().catch((err) => logger.error("[loth.liberarArbol] failed", { error: String(err), tenantId }));
}

async function ensureSpec(tenantId: string) {
  const enabled = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return enabled
    ? null
    : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

export const PATCH = withApiHandler("forestal-loth-id-patch", async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const existing = await ForestLothDB.getById(auth.tenantId, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const entry = await ForestLothDB.annul(auth.tenantId, id, parsed.data.reason, auth.username ?? "unknown");
    liberarArbolSiCorresponde(auth.tenantId, entry);
    return NextResponse.json({ entry });
  } catch (err) {
    // P1: anular una línea de un mes cerrado → 422 (dato del operador), no 500.
    return lothErrorResponse(err, "loth.PATCH", auth.tenantId);
  }
});

export const DELETE = withApiHandler("forestal-loth-id-delete", async (
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) => {
  const auth = await requireAdmin(req, ["admin", "owner"]);
  if (auth instanceof NextResponse) return auth;

  const rl = await applyRateLimit(req, "GENEROUS", "loth");
  if (rl) return rl;

  const guard = await ensureSpec(auth.tenantId);
  if (guard) return guard;

  const { id } = await ctx.params;

  try {
    const existing = await ForestLothDB.getById(auth.tenantId, id);
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    await ForestLothDB.softDelete(auth.tenantId, id, auth.username ?? "unknown");
    liberarArbolSiCorresponde(auth.tenantId, existing);
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Igual que el PATCH: los invariantes del libro (período cerrado, cadena
    // rota) tienen que llegar con su motivo, no como "error interno".
    return lothErrorResponse(err, "loth.DELETE", auth.tenantId);
  }
});
