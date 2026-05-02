import "server-only";

/**
 * lib/whatsapp/notify-yape-result.ts
 *
 * Notifica al cliente vía WhatsApp el resultado de la revisión de su pago Yape.
 *
 * Llamado por los endpoints superadmin de approve/reject. Fire-and-forget
 * (CLAUDE.md rule #7) — nunca bloquea la respuesta HTTP del dashboard.
 *
 * Si las env vars de WhatsApp no están configuradas, las funciones no hacen
 * nada (devuelven `false`) — útil en dev local sin Meta API real.
 */

import { sendBotReply } from "@/lib/whatsapp-bot";
import { logger } from "@/lib/logger";

interface NotifyApprovedOpts {
  customerPhone: string;
  orderIds: string[];
  totalAmount: number;
  storeNames?: string[];
}

interface NotifyRejectedOpts {
  customerPhone: string;
  reason: string;
  expectedAmount: number;
}

const PEN = (n: number): string =>
  new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
  }).format(n);

/**
 * Cliente: pago aprobado → tu pedido está confirmado y en preparación.
 */
export async function notifyYapeApproved(opts: NotifyApprovedOpts): Promise<boolean> {
  const { customerPhone, orderIds, totalAmount, storeNames } = opts;
  const shortIds = orderIds.map((id) => id.slice(-6).toUpperCase());

  const stores =
    storeNames && storeNames.length > 0
      ? `\n🏪 Tienda${storeNames.length > 1 ? "s" : ""}: ${[...new Set(storeNames)].join(", ")}`
      : "";

  const message =
    `✅ *¡Pago confirmado!*\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `Recibimos tu Yape de ${PEN(totalAmount)} y tu pedido ya está en preparación.\n\n` +
    `📦 Pedido${orderIds.length > 1 ? "s" : ""}: ${shortIds.map((s) => `#${s}`).join(", ")}` +
    stores +
    `\n\n` +
    `Te avisaremos cuando salga para entrega.\n` +
    `_Escribe *estado* para consultar en cualquier momento._`;

  try {
    const ok = await sendBotReply(customerPhone, message);
    if (!ok) {
      logger.warn("[notify-yape-result] approved: sendBotReply returned false", {
        customerPhone: customerPhone.slice(-6),
        orderIds,
      });
    }
    return ok;
  } catch (err) {
    logger.error("[notify-yape-result] approved: send failed", {
      error: err instanceof Error ? err.message : String(err),
      customerPhone: customerPhone.slice(-6),
    });
    return false;
  }
}

/**
 * Cliente: pago rechazado → razón + invitación a reenviar la captura correcta.
 */
export async function notifyYapeRejected(opts: NotifyRejectedOpts): Promise<boolean> {
  const { customerPhone, reason, expectedAmount } = opts;

  const message =
    `❌ *No pudimos confirmar tu pago*\n` +
    `━━━━━━━━━━━━━━━━━━━\n\n` +
    `Motivo: ${reason}\n\n` +
    `Total a pagar: *${PEN(expectedAmount)}*\n\n` +
    `📲 Por favor, envía nuevamente la captura correcta de tu pago Yape.\n` +
    `_Escribe *humano* si necesitas ayuda._`;

  try {
    const ok = await sendBotReply(customerPhone, message);
    if (!ok) {
      logger.warn("[notify-yape-result] rejected: sendBotReply returned false", {
        customerPhone: customerPhone.slice(-6),
      });
    }
    return ok;
  } catch (err) {
    logger.error("[notify-yape-result] rejected: send failed", {
      error: err instanceof Error ? err.message : String(err),
      customerPhone: customerPhone.slice(-6),
    });
    return false;
  }
}
