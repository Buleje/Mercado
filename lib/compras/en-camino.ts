/**
 * en-camino.ts — cuánto de cada producto ya está pedido y todavía no llegó
 * (auditoría Compras C27, noche 17-10). Puro: lo usa
 * `getStockEnTransito` y se prueba sin base.
 *
 * Antes sólo se contaban las órdenes `pendiente`, enteras: una `parcial` no
 * restaba nada porque no se sabía cuánto había llegado de cada línea, y la
 * sugerencia proponía volver a pedir lo que el proveedor todavía debía. Ahora
 * las recepciones guardan lo recibido por línea (`GoodsReceipt.itemsJson`), así
 * que por línea:
 *
 *   falta = pedido − llegó − no llegará (faltante acreditado)   (nunca < 0)
 *
 * Es la misma cuenta que «En qué va cada orden» (`ciclo-oc.ts`), con los mismos
 * acumuladores: lo que la orden dice que falta es lo que acá se descuenta.
 *
 * Sin doble conteo: lo que ya llegó está en el stock, por eso se resta; una
 * orden `recibido` o `cancelado` no suma (cancelarla vuelve a calcular la
 * sugerencia sola). El borrador automático (`auto_generated`) no está
 * confirmado con el proveedor: no se resta, se informa aparte para no pedir
 * dos veces.
 */
import { acumularNoLlegara, acumularRecibido, claveDeDia, esperaEntrega } from "./ciclo-oc";

export type LineaDeOrdenAbierta = {
  purchaseOrderId: string;
  status: string;
  /** Fecha prometida de la orden (medianoche UTC = día sin hora). */
  deliveryDate?: Date | string | null;
  productId: number;
  name: string;
  quantity: number;
};

export type RecepcionDeOrden = { id: string; purchaseOrderId: string | null; itemsJson: unknown };

export type EnCaminoProducto = {
  /** Unidades confirmadas (orden pendiente o parcial) que faltan llegar. */
  confirmado: number;
  /** En cuántas órdenes confirmadas viene algo. */
  ordenes: number;
  /** El día prometido más cercano (YYYY-MM-DD), si alguna orden lo tiene. */
  llegaEl: string | null;
  /** Unidades en borradores automáticos sin enviar: no se restan. */
  borrador: number;
};

const vacio = (): EnCaminoProducto => ({ confirmado: 0, ordenes: 0, llegaEl: null, borrador: 0 });

export function enCaminoPorProducto(
  lineas: readonly LineaDeOrdenAbierta[],
  recepciones: readonly RecepcionDeOrden[],
): Map<number, EnCaminoProducto> {
  const porOrden = new Map<string, LineaDeOrdenAbierta[]>();
  for (const l of lineas) {
    const lista = porOrden.get(l.purchaseOrderId) ?? [];
    lista.push(l);
    porOrden.set(l.purchaseOrderId, lista);
  }
  const recepcionesPorOrden = new Map<string, RecepcionDeOrden[]>();
  for (const r of recepciones) {
    if (!r.purchaseOrderId) continue;
    const lista = recepcionesPorOrden.get(r.purchaseOrderId) ?? [];
    lista.push(r);
    recepcionesPorOrden.set(r.purchaseOrderId, lista);
  }

  const out = new Map<number, EnCaminoProducto>();
  const de = (productId: number) => {
    const actual = out.get(productId) ?? vacio();
    out.set(productId, actual);
    return actual;
  };

  for (const [ordenId, items] of porOrden) {
    const status = items[0].status;
    if (status === "auto_generated") {
      for (const l of items) if (l.quantity > 0) de(l.productId).borrador += l.quantity;
      continue;
    }
    if (!esperaEntrega(status)) continue;

    // Una orden puede traer el mismo producto en dos líneas: se compara el total.
    const pedido = new Map<number, number>();
    for (const l of items) if (l.quantity > 0) pedido.set(l.productId, (pedido.get(l.productId) ?? 0) + l.quantity);
    const refs = items.map((l) => ({ productId: l.productId, name: l.name }));
    const deLaOrden = recepcionesPorOrden.get(ordenId) ?? [];
    const llego = acumularRecibido(deLaOrden, refs);
    const noLlegara = acumularNoLlegara(deLaOrden, refs);
    const dia = claveDeDia(items[0].deliveryDate ?? null);

    for (const [productId, cantidad] of pedido) {
      const falta = Math.max(0, cantidad - (llego.get(productId) ?? 0) - (noLlegara.get(productId) ?? 0));
      if (falta <= 0) continue;
      const p = de(productId);
      p.confirmado += falta;
      p.ordenes += 1;
      if (dia && (!p.llegaEl || dia < p.llegaEl)) p.llegaEl = dia;
    }
  }

  // Un producto que sólo tenía líneas ya completas no aporta nada.
  for (const [id, v] of out) if (v.confirmado === 0 && v.borrador === 0) out.delete(id);
  return out;
}
