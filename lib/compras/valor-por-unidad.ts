/**
 * Cuánto vale cada unidad de una orden de compra (revisión 17-10).
 *
 * Con costo por producto: costo × (total ÷ subtotal), que es donde el total metió
 * el IGV o el descuento. Las órdenes automáticas guardan el total con costo 0 por
 * producto: ahí el total se reparte por unidad pedida (si no, lo recibido valdría 0).
 */
export type LineaConCosto = { quantity: number; unitCost?: number };

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function valorPorUnidad(
  items: readonly LineaConCosto[],
  total: number | null | undefined,
): (linea: LineaConCosto | undefined) => number {
  const t = num(total);
  const subtotal = items.reduce((s, i) => s + i.quantity * num(i.unitCost), 0);
  const factor = subtotal > 0 && t > 0 ? t / subtotal : 1;
  const unidades = items.reduce((s, i) => s + i.quantity, 0);
  const respaldo = subtotal === 0 && t > 0 && unidades > 0 ? t / unidades : 0;
  return (linea) => (subtotal > 0 ? num(linea?.unitCost) * factor : respaldo);
}
