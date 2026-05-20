import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { AdminStoreReviewsDB } from "@/lib/db/admin-store-reviews.db";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

/**
 * GET /api/admin/store-reviews
 *   Lista reseñas de las tiendas del tenant logueado.
 *   query: status (pending|approved|rejected|hidden|all, default "all"), limit (1-100)
 *
 * PATCH /api/admin/store-reviews
 *   body: { id, action }
 *     action="approve" → status="approved"
 *     action="reject"  → status="rejected"
 *     action="hide"    → status="hidden"
 *     action="reply"   → adminReply (requiere body.reply)
 *
 * Audit project-wide 2026-05-19: migrado a AdminStoreReviewsDB.
 */

const GetQuery = z.object({
  status: z.enum(["pending", "approved", "rejected", "hidden", "all"]).default("all"),
  limit:  z.coerce.number().int().min(1).max(100).default(50),
});

const PatchBody = z.discriminatedUnion("action", [
  z.object({ id: z.string().min(1), action: z.literal("approve") }),
  z.object({ id: z.string().min(1), action: z.literal("reject") }),
  z.object({ id: z.string().min(1), action: z.literal("hide") }),
  z.object({ id: z.string().min(1), action: z.literal("reply"), reply: z.string().min(1).max(2000) }),
]);

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const parsed = GetQuery.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  try {
    const result = await AdminStoreReviewsDB.listForTenant(
      auth.tenantId,
      parsed.data.status,
      parsed.data.limit,
    );
    return NextResponse.json(result);
  } catch (err) {
    logger.error("[admin/store-reviews GET] error", { error: String(err) });
    return NextResponse.json({ error: "Error al listar reseñas" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-store-reviews"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    // Verificar tenant ownership antes de mutar
    const existing = await AdminStoreReviewsDB.findOwnedById(auth.tenantId, parsed.data.id);
    if (!existing) {
      return NextResponse.json({ error: "Reseña no encontrada" }, { status: 404 });
    }

    let updateData: Record<string, unknown> = {};
    switch (parsed.data.action) {
      case "approve": updateData = { status: "approved" }; break;
      case "reject":  updateData = { status: "rejected" }; break;
      case "hide":    updateData = { status: "hidden" }; break;
      case "reply":
        updateData = {
          adminReply:     parsed.data.reply.trim(),
          adminReplyDate: new Date(),
        };
        break;
    }

    const updated = await AdminStoreReviewsDB.updateStatus(
      auth.tenantId,
      parsed.data.id,
      updateData,
    );

    logger.info("[admin/store-reviews PATCH]", { tenantId: auth.tenantId, action: parsed.data.action, reviewId: parsed.data.id });

    return NextResponse.json({ ok: true, data: updated });
  } catch (err) {
    logger.error("[admin/store-reviews PATCH] error", { error: String(err) });
    return NextResponse.json({ error: "Error al actualizar reseña" }, { status: 500 });
  }
}
