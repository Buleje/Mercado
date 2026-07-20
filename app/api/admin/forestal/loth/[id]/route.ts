import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { ForestLothDB } from "@/lib/db/forest-loth.db";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
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
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[loth.DELETE] failed", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
});
