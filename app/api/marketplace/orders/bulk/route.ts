/**
 * Bulk PATCH para órdenes del marketplace de la tienda actual.
 *
 * Brandon mayo 2026 v7 (Nivel B): marcar N órdenes a la vez como
 * "confirmado" / "preparando" / "en_camino" / "cancelado". Valida cada
 * transición individualmente con la misma matriz que el PATCH individual.
 *
 * POST /api/marketplace/orders/bulk
 * Body: { ids: string[], status: "confirmado" | "preparando" | "en_camino" | "entregado" | "cancelado", cancelReason?: string }
 *
 * Devuelve: { ok: true, updatedCount, skipped: [{ id, reason }] }
 *
 * CR-1.1: migrado a MarketplaceOrdersDB.bulkChangeStatus (lib/db/marketplace/orders.db.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { MarketplaceOrdersDB } from "@/lib/db/marketplace.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

const BulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  status: z.enum(["confirmado", "preparando", "en_camino", "entregado", "cancelado"]),
  cancelReason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    // PENTEST 2026-05-18 Sprint B: rate limit STRICT (10 req/15min por IP).
    // Bulk acepta hasta 200 IDs por request → muy potente. Sin limit, atacante
    // con sesión admin puede mutar miles de órdenes en segundos + spam WhatsApp.
    const rl = applyRateLimit(req, "STRICT", "marketplace-orders-bulk");
    if (rl) return rl as NextResponse;

    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json().catch(() => ({}));
    const parsed = BulkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { ids, status: targetStatus, cancelReason } = parsed.data;

    // CR-1.1: migrado a MarketplaceOrdersDB.bulkChangeStatus.
    // Reemplaza 5 prisma.* directos (findMany, updateMany, historial×N,
    // commissionLedger×2). El método valida transiciones, registra historial
    // y gestiona comisiones internamente, scoped por tenantId.
    const { updatedCount, skipped } = await MarketplaceOrdersDB.bulkChangeStatus(
      auth.tenantId,
      ids,
      targetStatus,
      auth.username,
      cancelReason,
    );

    return NextResponse.json({
      ok: true,
      updatedCount,
      requested: ids.length,
      skipped,
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
