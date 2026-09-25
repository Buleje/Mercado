import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

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

/**
 * Item tal como se guarda en `GoodsReceipt.itemsJson`. `productId` es opcional
 * porque las recepciones libres se escriben a mano y sólo traen el nombre.
 */
type ItemRecepcionGuardado = {
  product?: unknown;
  productId?: unknown;
  receivedQty?: unknown;
};

type ClienteDb = Prisma.TransactionClient | { goodsReceipt: Prisma.TransactionClient["goodsReceipt"] };

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Suma, por producto, todo lo recibido en las recepciones ya registradas de
 * una OC. Cada item se resuelve por `productId` exacto y, si no vino (texto
 * libre), por nombre normalizado contra los items de la OC — el mismo criterio
 * que usa el endpoint de recepciones al mover stock.
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
  const recibido = new Map<number, number>();
  if (!purchaseOrderId) return recibido;

  const recepciones = await db.goodsReceipt.findMany({
    where: { tenantId, purchaseOrderId },
    select: { id: true, itemsJson: true },
  });

  for (const recepcion of recepciones) {
    if (excluirRecepcionId && recepcion.id === excluirRecepcionId) continue;
    if (!Array.isArray(recepcion.itemsJson)) continue;

    for (const raw of recepcion.itemsJson as ItemRecepcionGuardado[]) {
      if (raw == null || typeof raw !== "object") continue;

      const cantidad = Number(raw.receivedQty ?? 0);
      if (!Number.isFinite(cantidad) || cantidad <= 0) continue;

      const productId = resolverProductId(raw, ocItems);
      if (productId == null) continue;

      recibido.set(productId, (recibido.get(productId) ?? 0) + cantidad);
    }
  }

  return recibido;
}

/** productId exacto si vino; si no, match por nombre contra los items de la OC. */
function resolverProductId(raw: ItemRecepcionGuardado, ocItems: OcItemRef[]): number | null {
  const directo = Number(raw.productId);
  if (Number.isInteger(directo) && directo > 0) {
    return ocItems.some((i) => i.productId === directo) ? directo : null;
  }
  if (typeof raw.product !== "string") return null;
  const porNombre = ocItems.find((i) => norm(i.name) === norm(raw.product as string));
  return porNombre ? porNombre.productId : null;
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
