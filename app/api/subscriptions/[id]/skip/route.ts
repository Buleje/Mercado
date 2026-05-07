import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireCustomer } from "@/lib/auth/require-customer";
import { SubscriptionsDB } from "@/lib/db/subscriptions.db";
import { ApiError, toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/subscriptions/[id]/skip
 *
 * Salta la próxima entrega programada: crea un SubscriptionDelivery con
 * `skipped: true` y avanza nextDeliveryAt un ciclo.
 *
 * Auth: requireCustomer. Cross-tenant + ownership guard.
 * ADR-076.
 */

const SkipBody = z.object({
  reason: z.string().max(500).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const _rl = await applyRateLimit(req, "MODERATE", "subscriptions-X-skip"); if (_rl) return _rl;
  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;
  const { tenantId, customerId: userId } = customer;
  if (!userId) {
    return NextResponse.json(
      { error: "Cuenta no vinculada a perfil de cliente" },
      { status: 400 },
    );
  }
  const { id } = await params;

  let raw: unknown = {};
  try {
    // Body es opcional en este endpoint — `reason` puede venir o no.
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      raw = await req.json();
    }
  } catch {
    // Best-effort: si el body está mal, asumimos que es skip sin razón.
    raw = {};
  }

  const parsed = SkipBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Datos inválidos",
        issues: parsed.error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }

  try {
    const existing = await SubscriptionsDB.getById(tenantId, id);
    if (existing.userId !== userId) {
      return NextResponse.json(
        { error: "forbidden", message: "Suscripción pertenece a otro cliente" },
        { status: 403 },
      );
    }

    const item = await SubscriptionsDB.skipNextDelivery(
      tenantId,
      id,
      parsed.data.reason,
    );
    return NextResponse.json({ item });
  } catch (err) {
    const { payload, status } = toErrorPayload(err);
    if (!(err instanceof ApiError)) {
      logger.error("[api/subscriptions/[id]/skip] POST failed", {
        tenantId,
        id,
        error: String(err),
      });
    }
    return NextResponse.json(payload, { status });
  }
}
