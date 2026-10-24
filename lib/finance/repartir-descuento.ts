/**
 * El descuento de una venta, repartido entre sus líneas.
 *
 * POR QUÉ (2026-10-11): Rentabilidad sumaba `precio × cantidad` de cada línea
 * y no veía el descuento de la venta. En `main`, la única venta de octubre era
 * un arroz de S/ 24.90 cobrado S/ 0.10 (descuento S/ 24.80): Rentabilidad
 * decía ingresos S/ 24.90 y margen +S/ 6.61, y Ganancias —que suma el total
 * cobrado— −S/ 18.19. Lo que entra por un producto es lo que se COBRÓ por él.
 *
 * REGLA. El descuento es lo que falta entre el subtotal de las líneas y el
 * total cobrado del documento (en las ventas de mostrador es exactamente
 * `descuentoMonto`: medido en las 11 ventas de `main` y las 4 de Blas). Se
 * reparte en proporción al subtotal de cada línea, en céntimos, y los céntimos
 * que sobran del redondeo van a las líneas con la fracción más grande: la suma
 * de las líneas cierra EXACTO con el total. Si el total es MAYOR que las
 * líneas (un delivery, un recargo) no se reparte nada: eso no es venta de
 * ningún producto.
 */

const aCentimos = (soles: number): number => Math.round(soles * 100);

/**
 * Lo cobrado por cada línea, en soles, en el mismo orden.
 * @param subtotales precio × cantidad de cada línea del documento (TODAS, también las que después no se cuenten).
 * @param totalCobrado el total del documento.
 */
export function repartirDescuento(subtotales: readonly number[], totalCobrado: number): number[] {
  const subs = subtotales.map(aCentimos);
  const suma = subs.reduce((a, b) => a + b, 0);
  const descuento = Math.min(suma, Math.max(0, suma - aCentimos(totalCobrado)));
  if (descuento === 0 || suma <= 0) return subs.map((c) => c / 100);

  const exactos = subs.map((c) => (descuento * c) / suma);
  const partes = exactos.map(Math.floor);
  let sobran = descuento - partes.reduce((a, b) => a + b, 0);
  // Los céntimos que faltan, a las fracciones más grandes (empate: la línea de más arriba).
  const orden = exactos
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of orden) {
    if (sobran <= 0) break;
    partes[i] += 1;
    sobran -= 1;
  }
  return subs.map((c, i) => (c - partes[i]) / 100);
}

/** Una línea vendida con el documento al que pertenece. */
export interface LineaDeDocumento {
  /** Id de la venta u orden: las líneas del mismo documento se reparten juntas. */
  doc: string;
  totalDoc: number;
  price: number;
  quantity: number;
}

/** Lo cobrado por cada línea (mismo orden), repartiendo el descuento de cada documento. */
export function cobradoPorLinea(lineas: readonly LineaDeDocumento[]): number[] {
  const porDoc = new Map<string, number[]>();
  lineas.forEach((l, i) => {
    const idx = porDoc.get(l.doc);
    if (idx) idx.push(i);
    else porDoc.set(l.doc, [i]);
  });
  const neto = new Array<number>(lineas.length).fill(0);
  for (const indices of porDoc.values()) {
    const repartido = repartirDescuento(
      indices.map((i) => lineas[i].price * lineas[i].quantity),
      lineas[indices[0]].totalDoc,
    );
    indices.forEach((i, k) => { neto[i] = repartido[k]; });
  }
  return neto;
}
