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
 * @prisma-direct ok — scope tenant validado, transición validada por orden.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { invalidateByPrefix } from "@/lib/cache";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const VALID_TRANSITIONS: Record<string, string[]> = {
  pendiente:  ["confirmado", "cancelado"],
  confirmado: ["preparando", "en_camino", "cancelado"],
  preparando: ["en_camino", "cancelado"],
  en_camino:  ["entregado", "cancelado"],
  entregado:  [],
  cancelado:  [],
};

const BulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  status: z.enum(["confirmado", "preparando", "en_camino", "entregado", "cancelado"]),
  cancelReason: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
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

    // 1) Leer todas las órdenes para validar tenant y transiciones.
    // eslint-disable-next-line no-restricted-properties -- scope por tenantId; pre-validación de transiciones.
    const existing = await prisma.order.findMany({
      where: {
        id: { in: ids },
        tenantId: auth.tenantId,
        source: "marketplace",
        deletedAt: null,
      },
      select: { id: true, status: true },
    });
    const existingById = new Map(existing.map((o) => [o.id, o]));

    const updatable: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];
    for (const id of ids) {
      const o = existingById.get(id);
      if (!o) {
        skipped.push({ id, reason: "no encontrado" });
        continue;
      }
      const allowed = VALID_TRANSITIONS[o.status] ?? [];
      if (!allowed.includes(targetStatus)) {
        skipped.push({ id, reason: `no se puede pasar de "${o.status}" a "${targetStatus}"` });
        continue;
      }
      updatable.push(id);
    }

    if (updatable.length === 0) {
      return NextResponse.json({ ok: true, updatedCount: 0, skipped });
    }

    // 2) updateMany atómico scoped por tenantId.
    // eslint-disable-next-line no-restricted-properties -- updateMany scoped por tenantId+id; refactor a OrdersDB pendiente.
    const result = await prisma.order.updateMany({
      where: { id: { in: updatable }, tenantId: auth.tenantId, deletedAt: null },
      data: {
        status: targetStatus,
        ...(targetStatus === "cancelado" && {
          cancelReason: cancelReason ?? null,
          cancelledAt: new Date(),
        }),
      },
    });

    // 3) Historial por orden (fire-and-forget).
    for (const id of updatable) {
      const prev = existingById.get(id);
      if (!prev) continue;
      // eslint-disable-next-line no-restricted-properties -- audit insert con tenantId; refactor pendiente.
      prisma.orderStatusHistory
        .create({
          data: {
            id: crypto.randomUUID(),
            orderId: id,
            fromStatus: prev.status,
            toStatus: targetStatus,
            changedBy: auth.username,
            note: cancelReason ?? "bulk",
            tenantId: auth.tenantId,
          },
        })
        .catch((err) =>
          logger.warn("[marketplace/orders/bulk] history insert failed", {
            error: String(err),
            id,
          }),
        );
    }

    // 4) Comisiones — limpiar si entregado, revertir si cancelado.
    if (targetStatus === "entregado") {
      // eslint-disable-next-line no-restricted-properties -- bulk clear comisiones scoped por tenantId.
      prisma.commissionLedger
        .updateMany({
          where: { orderId: { in: updatable }, tenantId: auth.tenantId, status: "pending" },
          data: { status: "cleared", settledAt: new Date() },
        })
        .catch((err) =>
          logger.warn("[marketplace/orders/bulk] commission clear failed", { error: String(err) }),
        );
    } else if (targetStatus === "cancelado") {
      // eslint-disable-next-line no-restricted-properties -- bulk reverse comisiones scoped por tenantId.
      prisma.commissionLedger
        .updateMany({
          where: { orderId: { in: updatable }, tenantId: auth.tenantId, status: "pending" },
          data: { status: "reversed" },
        })
        .catch((err) =>
          logger.warn("[marketplace/orders/bulk] commission reverse failed", { error: String(err) }),
        );
    }

    invalidateByPrefix("marketplace:orders");

    return NextResponse.json({
      ok: true,
      updatedCount: result.count,
      requested: ids.length,
      skipped,
    });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
