import "server-only";
import { isFiadoDigitalPhase3Enabled } from "@/lib/feature-flags/fiado-digital";
import { getAvailableCredit } from "@/lib/credit/installment-manager";
import { FiadosDB } from "@/lib/db/fiados.db";
import { nextPayday } from "./payday";

export type FiadoEligibility = {
  eligible: boolean;
  availableCredit: number;
  creditLimit: number;
  dueDate: Date | null;
  reason: string | null;
};

const NO = (reason: string): FiadoEligibility => ({
  eligible: false,
  availableCredit: 0,
  creditLimit: 0,
  dueDate: null,
  reason,
});

/**
 * Decide si un cliente puede pagar `total` con fiado en el checkout
 * ("paga el día de pago" — pago único, sin cuotas ni interés).
 *
 * Gate autoritativo = `FiadosDB.validateForNewFiado` (lee filas Fiado reales:
 * bloquea por mora o por superar el límite). `getAvailableCredit` aporta el
 * límite controlado por el dueño y el crédito disponible para mostrar.
 *
 * tenantId 1er parámetro (regla multi-tenant).
 */
export async function getFiadoCheckoutEligibility(
  tenantId: string,
  customerId: string,
  total: number,
): Promise<FiadoEligibility> {
  if (!isFiadoDigitalPhase3Enabled()) return NO("Fiado no disponible");
  if (!Number.isFinite(total) || total <= 0) return NO("Monto inválido");

  const profile = await getAvailableCredit(tenantId, customerId);
  if (!profile.isActive) return NO("El fiado no está activado para tu cuenta");
  if (profile.creditLimit <= 0) return NO("Aún no tienes límite de fiado asignado");

  const block = await FiadosDB.validateForNewFiado(
    tenantId,
    customerId,
    total,
    profile.creditLimit,
  );
  if (block) return { ...NO(block.error), creditLimit: profile.creditLimit };

  return {
    eligible: true,
    availableCredit: profile.availableCredit,
    creditLimit: profile.creditLimit,
    dueDate: nextPayday(new Date()),
    reason: null,
  };
}
