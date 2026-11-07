/**
 * Cuánto se le devuelve al cliente en una devolución del POS.
 *
 * `SaleItem.price` guarda el precio con el descuento POR ÍTEM, pero no el
 * descuento GLOBAL de la venta (`Sale.descuentoMonto`, donde también va el
 * trueque). Devolver `price × cantidad` paga plata que nunca entró: una venta
 * de S/ 24,90 con S/ 24,80 de trueque cobró S/ 0,10 y su devolución salía de
 * S/ 24,90 (09-10, venta de QA `bc19cbe5`).
 *
 * Regla: cada línea se devuelve en la proporción que de verdad se cobró
 * (`Sale.total ÷ Σ price × cantidad`) y lo devuelto en todas las devoluciones
 * de la venta nunca pasa de `Sale.total`.
 *
 * Sin `"use client"`: lo usan la ruta de devolución y la vista previa del POS.
 */

function aCentimos(soles: number): number {
  return Number.isFinite(soles) && soles > 0 ? Math.round(soles * 100) : 0;
}

/**
 * Fracción de la suma de las líneas que se cobró: 1 sin descuento global,
 * 0 si el trueque cubrió todo. Nunca más de 1 ni menos de 0.
 */
export function factorCobrado(totalVenta: number, sumaLineas: number): number {
  if (!Number.isFinite(sumaLineas) || sumaLineas <= 0) return 0;
  if (!Number.isFinite(totalVenta) || totalVenta <= 0) return 0;
  return Math.min(1, totalVenta / sumaLineas);
}

/**
 * Tope del reembolso: lo que queda por devolver de lo cobrado
 * (`Sale.total − lo ya devuelto`), redondeado al céntimo.
 */
export function topeReembolso(bruto: number, totalVenta: number, yaReembolsado: number): number {
  const queda = Math.max(0, aCentimos(totalVenta) - aCentimos(yaReembolsado));
  return Math.min(aCentimos(bruto), queda) / 100;
}

export interface LineaVenta {
  /** `SaleItem.price` (ya con el descuento por ítem). */
  price: number;
  quantity: number;
}

export interface CalculoReembolso {
  factor: number;
  /** Precio por unidad que se devuelve de cada línea (`price × factor`). */
  precioDevuelto: (price: number) => number;
  /** Lo que se devuelve en total, con el tope de lo cobrado. */
  total: number;
}

/**
 * La cuenta entera, para la ruta y para la vista previa.
 * `completaLaVenta`: con esta devolución vuelve TODO lo vendido → se devuelve
 * exactamente lo que queda de lo cobrado. Sin esto, tres devoluciones de un
 * tercio cada una de una venta de S/ 10,00 sumaban S/ 9,99 por redondeo.
 */
export function calcularReembolso(params: {
  totalVenta: number;
  lineasVenta: readonly LineaVenta[];
  devolver: readonly LineaVenta[];
  yaReembolsado?: number;
  completaLaVenta?: boolean;
}): CalculoReembolso {
  const sumaLineas = params.lineasVenta.reduce((s, l) => s + l.price * l.quantity, 0);
  const factor = factorCobrado(params.totalVenta, sumaLineas);
  const yaReembolsado = params.yaReembolsado ?? 0;
  const bruto = params.completaLaVenta
    ? params.totalVenta
    : params.devolver.reduce((s, l) => s + l.price * factor * l.quantity, 0);
  return {
    factor,
    precioDevuelto: (price) => price * factor,
    total: topeReembolso(bruto, params.totalVenta, yaReembolsado),
  };
}

// ─── Plan de la devolución (servidor y vista previa) ─────────────────────────

export interface LineaVentaProducto extends LineaVenta {
  productId: number;
}

export interface PedidoDevolucion {
  productId: number;
  qty: number;
}

export type PlanDevolucion =
  | {
      ok: true;
      /** Un renglón por producto (los repetidos del pedido se suman). */
      lineas: { productId: number; qty: number; price: number }[];
      completaLaVenta: boolean;
    }
  | { ok: false; motivo: "no_esta_en_la_venta"; productId: number }
  | { ok: false; motivo: "excede"; productId: number; pedida: number; disponible: number };

/**
 * Qué se devuelve de cada producto y a qué precio, contando lo ya devuelto.
 *
 * - El mismo producto dos veces en el pedido se SUMA: antes cada renglón se
 *   medía solo contra lo ya devuelto y `[{p,1},{p,1}]` sobre una venta de 1
 *   devolvía 2.
 * - Si el producto va en dos líneas de la venta (precios distintos), las
 *   unidades ya devueltas consumen las primeras líneas y el precio que se
 *   devuelve es el de las líneas que quedan (promedio ponderado).
 * - Un producto que no está en la venta se rechaza (antes se salteaba y quedaba
 *   una devolución vacía de S/ 0).
 */
export function planDevolucion(
  lineasVenta: readonly LineaVentaProducto[],
  yaDevuelto: ReadonlyMap<number, number>,
  pedidos: readonly PedidoDevolucion[],
): PlanDevolucion {
  const pedidoPor = new Map<number, number>();
  for (const p of pedidos) pedidoPor.set(p.productId, (pedidoPor.get(p.productId) ?? 0) + p.qty);

  const lineas: { productId: number; qty: number; price: number }[] = [];
  for (const [productId, qty] of pedidoPor) {
    const delProducto = lineasVenta.filter((l) => l.productId === productId);
    if (delProducto.length === 0) return { ok: false, motivo: "no_esta_en_la_venta", productId };
    const vendida = delProducto.reduce((s, l) => s + l.quantity, 0);
    const devuelta = yaDevuelto.get(productId) ?? 0;
    const disponible = Math.max(0, vendida - devuelta);
    if (qty > disponible) return { ok: false, motivo: "excede", productId, pedida: qty, disponible };

    let saltar = devuelta;
    let falta = qty;
    let importe = 0;
    for (const l of delProducto) {
      const libres = Math.max(0, l.quantity - saltar);
      saltar = Math.max(0, saltar - l.quantity);
      const toma = Math.min(libres, falta);
      importe += toma * l.price;
      falta -= toma;
      if (falta === 0) break;
    }
    lineas.push({ productId, qty, price: qty > 0 ? importe / qty : 0 });
  }

  const completaLaVenta = lineasVenta.every((l) => {
    const vendida = lineasVenta.filter((x) => x.productId === l.productId).reduce((s, x) => s + x.quantity, 0);
    return (yaDevuelto.get(l.productId) ?? 0) + (pedidoPor.get(l.productId) ?? 0) >= vendida;
  });

  return { ok: true, lineas, completaLaVenta };
}

/** Unidades que quedan por devolver de cada LÍNEA de la venta (las ya devueltas consumen las primeras). */
export function quedaPorLinea(
  lineasVenta: readonly LineaVentaProducto[],
  yaDevuelto: ReadonlyMap<number, number>,
): number[] {
  const saltar = new Map(yaDevuelto);
  return lineasVenta.map((l) => {
    const s = saltar.get(l.productId) ?? 0;
    saltar.set(l.productId, Math.max(0, s - l.quantity));
    return Math.max(0, l.quantity - s);
  });
}

// ─── Nota de crédito: base, IGV y total al céntimo ───────────────────────────

export interface DesgloseNotaCredito {
  monto: number;
  igv: number;
  total: number;
}

/**
 * Base + IGV = total, los tres al céntimo y sumando exacto.
 * Con `totalConIgv` (lo que se devolvió en el POS, que cobra con IGV incluido)
 * la base sale del total; con `base` (lo que escribe el contador) el IGV se le
 * suma. Antes `igv = monto × 0,18` sin redondear: 8,47 → total 9,9946.
 */
export function desgloseNotaCredito(
  entrada: { totalConIgv: number } | { base: number },
  tasa: number,
): DesgloseNotaCredito {
  const t = Number.isFinite(tasa) && tasa >= 0 ? tasa : 0;
  if ("totalConIgv" in entrada) {
    const totalC = aCentimos(entrada.totalConIgv);
    const baseC = Math.round(totalC / (1 + t));
    return { monto: baseC / 100, igv: (totalC - baseC) / 100, total: totalC / 100 };
  }
  const baseC = aCentimos(entrada.base);
  const igvC = Math.round(baseC * t);
  return { monto: baseC / 100, igv: igvC / 100, total: (baseC + igvC) / 100 };
}

/**
 * Base que todavía se puede acreditar de una venta. `Sale.total` trae el IGV
 * incluido y las notas guardan la base: antes se comparaba base contra total
 * con IGV y se podía acreditar un 18 % de más.
 */
export function baseDisponibleNotaCredito(totalVenta: number, baseYaEmitida: number, tasa: number): number {
  const t = Number.isFinite(tasa) && tasa >= 0 ? tasa : 0;
  const baseVentaC = Math.round(aCentimos(totalVenta) / (1 + t));
  return Math.max(0, baseVentaC - aCentimos(baseYaEmitida)) / 100;
}
