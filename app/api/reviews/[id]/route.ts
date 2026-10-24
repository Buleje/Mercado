import { NextRequest, NextResponse } from "next/server";
import { ReviewsDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { z } from "zod";

/* Moderar reseñas (aprobar, rechazar, responder a nombre de la tienda, borrar) es de
   gestión: `requireAdmin(req, ["admin"])` deja pasar admin, dueño y encargado. Sin
   roles, el cajero (reseñas sólo de lectura) podía borrar las malas (security 11-10). */
const ROLES_MODERAR = ["admin"] as const;

const PatchSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  adminReply: z.string().trim().max(1000).nullable().optional(),
});

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const _rl = await applyRateLimit(req, "MODERATE", "reviews-X"); if (_rl) return _rl;
    const auth = await requireAdmin(req, ROLES_MODERAR);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    await ReviewsDB.delete(auth.tenantId, id);
    return NextResponse.json({ ok: true });

  } catch (e) {
    logger.error("[delete] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const _rl = await applyRateLimit(req, "MODERATE", "reviews-X"); if (_rl) return _rl;
    const auth = await requireAdmin(req, ROLES_MODERAR);
    if (auth instanceof NextResponse) return auth;

    const { id } = await params;
    const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) }, { status: 400 });
    }
    const body = parsed.data;

    if (body.status !== undefined) {
      await ReviewsDB.updateStatus(auth.tenantId, id, body.status);
      return NextResponse.json({ ok: true });
    }

    if (body.adminReply !== undefined) {
      await ReviewsDB.updateReply(auth.tenantId, id, body.adminReply ?? null);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  } catch (e) {
    logger.error("[patch] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
