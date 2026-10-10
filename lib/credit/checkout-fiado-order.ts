import "server-only";
import { getFiadoCheckoutEligibility } from "@/lib/credit/checkout-fiado";
import { FiadosDB } from "@/lib/db/fiados.db";

/**
 * Re-valida la elegibilidad en backend y crea el Fiado ligado a una orden
 * (pago único "paga el día de pago"). Lanza si el cliente no es elegible —
 * en ese caso la orden NO debe quedar registrada como fiado.
 *
 * Atomicidad estricta (Fiado dentro de la misma tx que la Order) queda como
 * hardening del checkout-squad usando `FiadosDB.createInTransaction`.
 */
export async function createFiadoForOrder(
  tenantId: string,
  args: { orderId: string; customerId: string; total: number },
): Promise<{ id: string }> {
  const elig = await getFiadoCheckoutEligibility(
    tenantId,
    args.customerId,
    args.total,
  );
  if (!elig.eligible || !elig.dueDate) {
    throw new Error(elig.reason ?? "No elegible para fiado");
  }
  const fiado = await FiadosDB.create({
    tenantId,
    customerId: args.customerId,
    total: args.total,
    descripcion: `Pedido ${args.orderId}`,
    fechaVence: elig.dueDate,
  });
  return { id: fiado.id };
}
