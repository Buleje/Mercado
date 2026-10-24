/**
 * Cuánto queda por acreditar de un documento (venta del POS o pedido de la tienda) y lo que se cobró
 * de verdad por cada línea. La MISMA cuenta que el tope de POST /api/notas-credito (`topeNotaCredito`):
 * con IGV, en céntimos, contra el `total` de las notas activas (las anuladas no cuentan).
 *
 * Sin `"use client"` ni `server-only`: la usa la ruta `GET /api/notas-credito/remanente` y la vista
 * previa del asistente, para que lo que se ve antes de guardar sea lo que el servidor deja pasar
 * (auditoría de comprobantes F12, 17-10: «no se acredita dos veces la misma parte»).
 */
import { factorCobrado } from "@/lib/pos/reembolso";

const aCentimos = (soles: number): number => Math.round((Number.isFinite(soles) ? soles : 0) * 100);

export interface NotaDelDocumento {
  total: number;
  status: string;
}

export interface RemanenteDocumento {
  /** Lo que cobró el documento, CON IGV. */
  totalDocumento: number;
  /** Suma de `total` (con IGV) de las notas que no están anuladas. */
  acreditadoConIgv: number;
  /** Lo que todavía se puede acreditar, CON IGV. */
  disponibleConIgv: number;
  /** Lo mismo sin IGV (lo que escribe el contador). */
  disponibleBase: number;
  /** Notas activas (borrador o emitida) que ya restan del documento. */
  notasActivas: number;
}

export function remanenteDocumento(
  totalDocumento: number,
  notas: readonly NotaDelDocumento[],
  tasa: number,
): RemanenteDocumento {
  const t = Number.isFinite(tasa) && tasa >= 0 ? tasa : 0;
  const activas = notas.filter((n) => n.status !== "ANULADA");
  const totalC = Math.max(0, aCentimos(totalDocumento));
  const acreditadoC = activas.reduce((s, n) => s + Math.max(0, aCentimos(n.total)), 0);
  const dispC = Math.max(0, totalC - acreditadoC);
  return {
    totalDocumento: totalC / 100,
    acreditadoConIgv: acreditadoC / 100,
    disponibleConIgv: dispC / 100,
    disponibleBase: Math.round(dispC / (1 + t)) / 100,
    notasActivas: activas.length,
  };
}

/**
 * «Usar lo devuelto en Caja» propone las unidades que volvieron por Caja › Devolución. Esas unidades
 * no traen qué nota las acreditó: si las notas activas ya cubren lo que Caja devolvió (con IGV, en
 * céntimos), proponerlas otra vez es acreditar dos veces la misma unidad (revisión 17-10, bajo).
 * Se ofrece sólo si hay unidades devueltas Y lo acreditado todavía no llega a lo devuelto.
 */
export function ofrecerDevueltoEnCaja(
  lineas: readonly Pick<LineaAjustable, "devueltasEnCaja">[],
  acreditadoConIgv: number,
  reembolsadoEnCaja: number,
): boolean {
  if (!lineas.some((l) => l.devueltasEnCaja > 0)) return false;
  return aCentimos(acreditadoConIgv) < aCentimos(reembolsadoEnCaja);
}

export interface LineaOrigen {
  productId: number;
  nombre: string;
  cantidad: number;
  /** Precio por unidad guardado en la línea (con IGV, ya con el descuento por ítem). */
  precio: number;
}

export interface LineaAjustable {
  productId: number;
  nombre: string;
  vendidas: number;
  /** Unidades de esta línea que ya volvieron por Caja › Devolución. */
  devueltasEnCaja: number;
  /** Precio de lista de la línea. */
  precioLista: number;
  /** Lo que se cobró de verdad por unidad: descuento global y trueque prorrateados. */
  precioCobrado: number;
}

/**
 * Cada línea con lo cobrado de verdad: una venta de S/ 24,90 con S/ 24,80 de trueque cobró S/ 0,10
 * y su nota no puede ir por S/ 24,90 (venta QA `bc19cbe5`, 09-10). `devueltas` = unidades ya devueltas
 * por producto (`DevolucionesPosDB.estado().yaDevuelto`); si el producto está en dos líneas, se cuentan
 * desde la primera.
 */
export function lineasAjustables(
  totalDocumento: number,
  lineas: readonly LineaOrigen[],
  devueltas: Readonly<Record<string, number>> = {},
): LineaAjustable[] {
  const sumaLineas = lineas.reduce((s, l) => s + Math.max(0, l.precio) * Math.max(0, l.cantidad), 0);
  const factor = factorCobrado(totalDocumento, sumaLineas);
  const quedan = new Map<number, number>(Object.entries(devueltas).map(([k, v]) => [Number(k), Math.max(0, Number(v) || 0)]));
  return lineas.map((l) => {
    const vendidas = Math.max(0, l.cantidad);
    const ya = quedan.get(l.productId) ?? 0;
    const enEsta = Math.min(vendidas, ya);
    quedan.set(l.productId, ya - enEsta);
    return {
      productId: l.productId,
      nombre: l.nombre,
      vendidas,
      devueltasEnCaja: enEsta,
      precioLista: aCentimos(l.precio) / 100,
      precioCobrado: Math.round(Math.max(0, l.precio) * factor * 100) / 100,
    };
  });
}

/**
 * Importe CON IGV de las líneas elegidas, nunca más de lo que queda. Si se eligen TODAS las unidades
 * de todas las líneas, va exactamente lo que queda: sumar precios redondeados al céntimo línea por
 * línea podía pasarse 1-2 céntimos y el servidor respondía 400.
 */
export function importeDeLineas(
  lineas: readonly Pick<LineaAjustable, "vendidas" | "precioCobrado">[],
  cantidades: readonly number[],
  disponibleConIgv: number,
): number {
  const dispC = Math.max(0, aCentimos(disponibleConIgv));
  const completa = lineas.length > 0 && lineas.every((l, i) => (cantidades[i] ?? 0) >= l.vendidas);
  if (completa) return dispC / 100;
  const sumaC = lineas.reduce((s, l, i) => {
    const q = Math.max(0, Math.min(l.vendidas, Math.floor(cantidades[i] ?? 0)));
    return s + q * aCentimos(l.precioCobrado);
  }, 0);
  return Math.min(sumaC, dispC) / 100;
}
