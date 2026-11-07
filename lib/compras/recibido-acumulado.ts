import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { acumularRecibido } from "@/lib/compras/ciclo-oc";

/**
 * recibido-acumulado.ts — cuánto se recibió YA de una orden de compra.
 *
 * Existe porque dos caminos distintos suman stock de la misma OC:
 * `POST /api/compras/recepciones` (el botón "Recibir") y
 * `PATCH /api/purchases/[id]` (el `<select>` de estado). Ninguno de los dos
 * miraba lo que el otro había recibido, y el resultado era plata inventada:
 *
 *   OC de 10 · recepción de 4 · el select marca "Recibido" → stock 14.
 *
 * Medido el 2026-08-11 sobre el tenant `main`: cuatro unidades que no existen
 * en el depósito. El defecto hermano: la recepción comparaba CADA tanda contra
 * el total de la OC (`4 < 10` → parcial), así que una compra recibida en dos
 * viajes quedaba "parcial" para siempre — y para cerrarla había que usar el
 * select, que es justamente el que duplicaba.
 *
 * Este módulo es la única fuente de "ya recibido". Los dos caminos lo
 * consultan antes de tocar stock.
 */

/** Item de la OC contra el que se resuelve un item de recepción. */
export type OcItemRef = { productId: number; name: string };

type ClienteDb = Prisma.TransactionClient | { goodsReceipt: Prisma.TransactionClient["goodsReceipt"] };

/**
 * Suma, por producto, todo lo recibido en las recepciones ya registradas de
 * una OC. Cada item se resuelve por `productId` exacto y, si no vino (texto
 * libre), por nombre normalizado contra los items de la OC — el mismo criterio
 * que usa el endpoint de recepciones al mover stock. La cuenta vive en
 * `ciclo-oc.ts` (`acumularRecibido`) para que la pantalla sume igual (C19).
 *
 * @param excluirRecepcionId recepción a ignorar (la que se está creando ahora,
 *   si ya se persistió antes de calcular el acumulado previo).
 */
export async function getRecibidoAcumulado(
  db: ClienteDb,
  tenantId: string,
  purchaseOrderId: string,
  ocItems: OcItemRef[],
  excluirRecepcionId?: string,
): Promise<Map<number, number>> {
  if (!purchaseOrderId) return new Map<number, number>();

  const recepciones = await db.goodsReceipt.findMany({
    where: { tenantId, purchaseOrderId },
    select: { id: true, itemsJson: true },
  });

  return acumularRecibido(recepciones, ocItems, excluirRecepcionId);
}

/**
 * Saldo pendiente de un item: lo pedido menos lo ya recibido, nunca negativo.
 * Recibir de más (llegó 12 de una OC de 10) deja el saldo en 0 — el excedente
 * ya entró al stock por su propia recepción, no se vuelve a sumar.
 */
export function saldoPendiente(cantidadPedida: number, yaRecibido: number): number {
  return Math.max(0, cantidadPedida - yaRecibido);
}

/** Una OC está completa cuando NINGÚN item suyo tiene saldo pendiente. */
export function estaCompleta(
  ocItems: Array<{ productId: number; quantity: number }>,
  recibidoPorProducto: Map<number, number>,
): boolean {
  return ocItems.every(
    (item) => saldoPendiente(item.quantity, recibidoPorProducto.get(item.productId) ?? 0) === 0,
  );
}
