import "server-only";
import { type NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { SubscriptionsDB } from "@/lib/db/subscriptions.db";
import { ApiError, toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/subscriptions
 *
 * Lista de suscripciones "Bodega al Mes" para el panel admin, cualquier
 * cliente del tenant (a diferencia de /api/subscriptions que es self-service
 * del cliente logueado). Enriquecida con Customer.name y Product.name/price
 * vía SubscriptionsDB.listForTenantAdmin. ADR-076.
 *
 * Query param opcional `status` (active|paused|cancelled).
 */
const STATUS_VALUES = ["active", "paused", "cancelled"] as const;

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, [
    "admin",
    "cajero",
    "owner",
    "manager",
    "analista",
  ]);
  if (auth instanceof NextResponse) return auth;

  const statusParam = req.nextUrl.searchParams.get("status");
  const status = STATUS_VALUES.includes(statusParam as (typeof STATUS_VALUES)[number])
    ? (statusParam as (typeof STATUS_VALUES)[number])
    : undefined;

  try {
    const items = await SubscriptionsDB.listForTenantAdmin(auth.tenantId, { status });
    return NextResponse.json({ items });
  } catch (err) {
    const { payload, status: httpStatus } = toErrorPayload(err);
    if (!(err instanceof ApiError)) {
      logger.error("[api/admin/subscriptions] GET failed", {
        tenantId: auth.tenantId,
        error: String(err),
      });
    }
    return NextResponse.json(payload, { status: httpStatus });
  }
}
