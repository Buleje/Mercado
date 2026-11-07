import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { SubscriptionsDB } from "@/lib/db/subscriptions.db";
import { ApiError, toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * PATCH /api/admin/subscriptions/[id]
 *
 * Pausar / reanudar / cancelar una suscripción de cualquier cliente del
 * tenant (acción de admin, no self-service). ADR-076.
 */
const PatchBody = z.object({
  status: z.enum(["active", "paused", "cancelled"]),
  cancelReason: z.string().max(500).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "admin-subscriptions-x"); if (_rl) return _rl;
  const auth = await requireAdmin(req, [
    "admin",
    "cajero",
    "owner",
    "manager",
    "analista",
  ]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const parsed = PatchBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Datos inválidos",
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const item = await SubscriptionsDB.updateStatus(auth.tenantId, id, {
      status: parsed.data.status,
      cancelReason: parsed.data.cancelReason,
    });
    return NextResponse.json({ item });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    if (!(err instanceof ApiError)) {
      logger.error("[api/admin/subscriptions/[id]] PATCH failed", {
        tenantId: auth.tenantId,
        id,
        error: String(err),
      });
    }
    return NextResponse.json(payload, { status });
  }
}
