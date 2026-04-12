import "server-only";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { logger } from "@/lib/logger";
import type { LoyaltyTierName } from "@/lib/loyalty/auto-earn";

/**
 * lib/loyalty/tier-upgrade-notifier.ts
 *
 * Envía una notificación WhatsApp al cliente cuando sube de tier.
 * Fire-and-forget: el caller debe invocar con .catch(() => {})
 * para cumplir CLAUDE.md regla #7.
 *
 * @param tenantId     - Tenant del negocio (primer parámetro, CLAUDE.md regla #3).
 * @param customerId   - Teléfono normalizado del cliente (PK en Customer).
 * @param previousTier - Nivel antes de la compra.
 * @param currentTier  - Nivel después de la compra.
 */
export async function notifyTierUpgrade(
  tenantId: string,
  customerId: string,
  previousTier: LoyaltyTierName,
  currentTier: LoyaltyTierName,
): Promise<boolean> {
  try {
    const benefits: Record<LoyaltyTierName, string> = {
      Bronce: "ofertas exclusivas de miembros",
      Plata: "2% de descuento automatico + prioridad en delivery",
      Oro: "4% de descuento automatico + acceso anticipado a promos + atencion WhatsApp preferencial",
      Diamante: "6% de descuento automatico + delivery gratis ilimitado + acceso VIP + gestor personal",
    };

    const emoji: Record<LoyaltyTierName, string> = {
      Bronce: "🥉",
      Plata: "🥈",
      Oro: "🥇",
      Diamante: "💎",
    };

    const message =
      `${emoji[currentTier]} *¡Felicidades!* Subiste de nivel ${previousTier} a *${currentTier}* en Buleje.\n\n` +
      `Tus nuevos beneficios:\n${benefits[currentTier]}\n\n` +
      `¡Gracias por tu preferencia! Sigue comprando para acumular mas puntos.`;

    const sent = await sendWhatsAppText(customerId, message);

    if (sent) {
      logger.info("[tier-upgrade-notifier] WhatsApp enviado", {
        tenantId,
        customerId,
        previousTier,
        currentTier,
      });
    }

    return sent;
  } catch (err) {
    // No-throw: nunca bloquear el path principal por un fallo de notificación.
    logger.error("[tier-upgrade-notifier] Error enviando WhatsApp", {
      tenantId,
      customerId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
