import "server-only";
/**
 * lib/socio/order-cashback.ts — Acredita cashback de Socio al confirmar un pedido.
 *
 * Fase 1 del loop de cashback (ADR-078): earn-on-order. NO toca el total de pago
 * (el cashback es aditivo, se acredita DESPUÉS de crear la orden). Idempotente por
 * orderId (guard en earnCashback) y fire-and-forget (nunca rompe el checkout).
 *
 * Identidad: el socio `userId` == el teléfono del cliente (== customerId de la
 * sesión que firma el checkout). Un pedido de un no-socio → no-op silencioso.
 */

import { SocioBulejeDB } from "@/lib/db/socio-buleje.db";
import { SOCIO_CASHBACK_PCT } from "@/lib/db/interfaces/ISocioBulejeDB";
import { logger } from "@/lib/logger";

/**
 * Acredita `SOCIO_CASHBACK_PCT` del total del pedido como cashback al socio dueño
 * del teléfono. Seguro de llamar para cualquier pedido: si no hay membership
 * activa/trial, no hace nada.
 */
export async function creditOrderCashback(
  tenantId: string,
  phone: string,
  orderId: string,
  orderTotal: number,
): Promise<void> {
  try {
    if (!tenantId || !phone || !orderId) return;
    if (!Number.isFinite(orderTotal) || orderTotal <= 0) return;

    const membership = await SocioBulejeDB.getMembership(tenantId, phone);
    if (!membership) return;
    // Solo socios con beneficios activos ganan cashback (active o trial).
    if (membership.status !== "active" && membership.status !== "trial") return;

    const amount = Math.round(orderTotal * SOCIO_CASHBACK_PCT * 100) / 100;
    if (amount <= 0) return;

    const pct = Math.round(SOCIO_CASHBACK_PCT * 100);
    await SocioBulejeDB.earnCashback(
      tenantId,
      phone,
      orderId,
      amount,
      `Cashback ${pct}% · pedido ${orderId}`,
    );
  } catch (err) {
    logger.warn("[socio/order-cashback] skipped", {
      orderId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
