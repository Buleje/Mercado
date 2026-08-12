/**
 * totales-oc.ts — los números de una orden de compra, calculados una sola vez.
 *
 * Existe por un descuadre medido el 2026-08-11: el PDF y el mensaje de
 * WhatsApp que se le mandan al proveedor sumaban 18% de IGV ENCIMA del costo
 * y además ignoraban el descuento pactado. Sobre las órdenes reales del tenant
 * `main`:
 *
 *   pantalla S/160.80 → papel S/189.74  (+S/28.94)
 *   pantalla S/370.50 → papel S/460.20  (+S/89.70, con 5% de descuento ignorado)
 *
 * El papel que sale de la empresa decía un precio que la orden no pactó.
 *
 * La regla que aplica acá: `total` es lo que guardó el backend, no algo que el
 * cliente recalcule. El IGV se muestra como la parte que YA está contenida en
 * ese total (base + IGV = total), nunca como un agregado encima.
 */

export const IGV_PERU = 0.18;

export type ItemParaTotales = { quantity: number; unitCost: number | string };

/** Número finito o 0. Un NaN acá termina impreso en la orden del proveedor. */
function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export type TotalesOC = {
  /** Suma de los items, antes de descuento. */
  subtotalBruto: number;
  /** Porcentaje de descuento pactado con el proveedor. */
  descuentoPct: number;
  /** Cuánta plata representa ese descuento. */
  descuentoMonto: number;
  /** Lo que se le paga al proveedor: el total que guardó el backend. */
  total: number;
  /** Parte del total que corresponde a mercadería (total ÷ 1.18). */
  baseImponible: number;
  /** Parte del total que corresponde a IGV (total − base). */
  igvContenido: number;
};

/**
 * @param oc orden con sus items y el `total` que devolvió el backend.
 *   Si `total` no viene (una orden que todavía se está armando en pantalla),
 *   se deriva del subtotal y el descuento con la misma fórmula del servidor.
 */
export function totalesOC(oc: {
  items: ItemParaTotales[];
  total?: number | string | null;
  discount?: number | string | null;
}): TotalesOC {
  // Todo pasa por `num`: los costos llegan como Decimal serializado, de
  // localStorage o de props externas, y un NaN suelto acá se imprime en el
  // papel que ve el proveedor.
  const subtotalBruto = oc.items.reduce(
    (suma, item) => suma + num(item.quantity) * num(item.unitCost),
    0,
  );
  const descuentoPct = Math.min(100, Math.max(0, num(oc.discount)));

  const totalGuardado = oc.total == null ? null : Number(oc.total);
  const total = Math.max(
    0,
    totalGuardado != null && Number.isFinite(totalGuardado)
      ? totalGuardado
      : subtotalBruto * (1 - descuentoPct / 100),
  );

  const baseImponible = total / (1 + IGV_PERU);

  return {
    subtotalBruto,
    descuentoPct,
    descuentoMonto: subtotalBruto - total,
    total,
    baseImponible,
    igvContenido: total - baseImponible,
  };
}
