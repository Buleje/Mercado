import "server-only";
import { CouponsDB } from "@/lib/db/coupons.db";
import { JUNTA_COUPON_PERCENT, JUNTA_COUPON_DAYS } from "./constants";

export { JUNTA_COUPON_PERCENT, JUNTA_COUPON_DAYS };

/**
 * Emite el cupón de recompensa de una junta completa. El código del cupón ES
 * el código de la junta (memorable + único por tenant). maxUses = miembros meta
 * (cada vecino lo usa una vez). Idempotencia: el caller lo invoca una sola vez
 * en la transición OPEN→COMPLETE; si el cupón ya existiera, Prisma lanza P2002.
 */
export async function issueJuntaCoupon(
  tenantId: string,
  junta: { code: string; targetMembers: number },
  now: Date = new Date(),
): Promise<string> {
  const expiresAt = new Date(
    now.getTime() + JUNTA_COUPON_DAYS * 24 * 3600 * 1000,
  );
  await CouponsDB.create(tenantId, {
    code: junta.code,
    description: `La Junta del Barrio ${junta.code} — completada`,
    discountType: "percent",
    discountValue: JUNTA_COUPON_PERCENT,
    maxUses: junta.targetMembers,
    expiresAt,
  });
  return junta.code;
}
