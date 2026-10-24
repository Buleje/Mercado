/**
 * Constantes de La Junta del Barrio (compra colaborativa vecinal).
 *
 * ⚠️ RECONSTRUIDO 2026-07-03 tras pérdida de WIP sin commitear. La ESTRUCTURA
 * (JUNTA_REWARD_TIERS + juntaCouponPercent) se recuperó de los componentes que
 * la consumen (CreateJuntaForm, JuntaRewardLadder, /juntas). Los VALORES de %
 * y metas son una inferencia sensata (bounds 2–12, default 4, base 10%) —
 * Brandon: revisá/ajustá los números si tu versión original difería.
 */

/** % de descuento base del cupón que se emite al completar una junta. */
export const JUNTA_COUPON_PERCENT = 10;
/** Días de validez del cupón desde que se completa la junta. */
export const JUNTA_COUPON_DAYS = 7;

/**
 * Escalera de recompensa: "más vecinos, más ahorro". Cada peldaño = meta de
 * miembros → % de descuento para todos. Single source para el hub `/juntas`,
 * el form de armado y la card. 3 peldaños (grid de 3). Metas dentro de [2,12]
 * (validación de `POST /api/juntas`).
 */
export const JUNTA_REWARD_TIERS = [
  { members: 4, percent: 10 },
  { members: 6, percent: 12 },
  { members: 10, percent: 15 },
] as const;

/**
 * % de descuento para una meta de vecinos dada. Devuelve el % del peldaño más
 * alto cuya meta ya se alcanza; para metas menores al primer peldaño, el base.
 */
export function juntaCouponPercent(targetMembers: number): number {
  let percent = JUNTA_COUPON_PERCENT;
  for (const tier of JUNTA_REWARD_TIERS) {
    if (targetMembers >= tier.members) percent = tier.percent;
  }
  return percent;
}
