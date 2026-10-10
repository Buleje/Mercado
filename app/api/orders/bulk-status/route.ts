import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { runWithAuditContext } from "@/lib/audit/audit-context";
import { DropshipDB } from "@/lib/db/dropship.db";
import { OrdersDB } from "@/lib/db/orders.db";

const VALID_STATUSES = ["pendiente", "confirmado", "preparando", "en_camino", "entregado", "cancelado"] as const;

const BulkStatusSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  status: z.enum(VALID_STATUSES),
});

// POST /api/orders/bulk-status — bulk status update (admin only)
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "orders-bulk-status"); if (_rl) return _rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BulkStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 },
    );
  }

  const { ids, status } = parsed.data;

  // Round 14 M004: audit log de Order.updateMany bulk con admin actor + IP.
  return runWithAuditContext(req, auth.username, async () => {
  try {
    // Misma máquina de estados que el cambio de a uno (PATCH /api/orders/[id]):
    // `OrdersDB.cambiarEstadoEnLote` salta las transiciones inválidas (de
    // entregado a cancelado, revivir un cancelado) y cancela con
    // `cancelarConReposicion` (cancelledAt + stock una sola vez por pedido).
    const lote = await OrdersDB.cambiarEstadoEnLote(auth.tenantId, ids, status);
    const stockRepuesto = lote.stockRepuesto;
    const result = { count: lote.actualizados.length };

    const encontrados = lote.actualizados.length + lote.rechazados.length + lote.sinCambio.length;
    if (encontrados === 0 && lote.noEncontrados.length > 0) {
      return NextResponse.json({ error: "No se encontraron pedidos válidos para este tenant" }, { status: 404 });
    }
    if (result.count === 0 && lote.rechazados.length > 0) {
      const desde = [...new Set(lote.rechazados.map((r) => r.desde))].join(", ");
      return NextResponse.json(
        {
          error: `No se puede cambiar de "${desde}" a "${status}".`,
          code: "TRANSICION_INVALIDA",
          rechazados: lote.rechazados,
        },
        { status: 422 },
      );
    }

    const requestId = req.headers.get("x-request-id") ?? undefined;
    logActivity(
      "Bulk", "pedido",
      `Cambio masivo de estado a "${status}" — ${result.count} pedido(s)`,
      undefined, auth.username, requestId,
    ).catch((err) => logger.warn("[orders/bulk-status] activity log failed", { err: String(err) }));

    // ── Dropshipping (ADR-298) ──────────────────────────────────────────
    // El trigger de fulfillment vive en OrdersDB.update, que esta ruta NO usa
    // (updateMany directo). Sin esto, confirmar pedidos EN LOTE — el flujo
    // habitual del admin — nunca generaba el envío al proveedor. Replicamos el
    // disparo acá: fire-and-forget + self-scoped por tenant (cada
    // createFulfillmentsFromOrder valida el order por tenantId), igual que en
    // OrdersDB.update. Idempotente (no duplica si el pedido ya tiene envíos).
    if (status === "confirmado" && result.count > 0) {
      void (async () => {
        if (!(await DropshipDB.isEnabled(auth.tenantId))) return;
        for (const id of lote.actualizados) {
          const n = await DropshipDB.createFulfillmentsFromOrder(auth.tenantId, id);
          if (n > 0) logger.info("[dropship] fulfillments creados (bulk)", { tenantId: auth.tenantId, orderId: id, n });
        }
      })().catch((err) =>
        logger.error("[dropship] fallo al crear fulfillment (bulk)", { tenantId: auth.tenantId, error: String(err) }),
      );
    }

    return NextResponse.json({
      ok: true,
      updated: result.count,
      stockRepuesto,
      rechazados: lote.rechazados,
      sinCambio: lote.sinCambio.length,
    });
  } catch (e) {
    logger.error("[orders/bulk-status] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
  });
}
