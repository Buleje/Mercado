/**
 * lotes-recepcion.ts — el «vence» que se anota al recibir mercadería.
 *
 * Hasta el 09-10 la recepción no pedía fecha de vencimiento: los únicos lotes
 * (`Batch`) eran los de alta manual en Inventario, así que las alertas de
 * vencimiento y los descuentos por vencer (cron `expiry-discounts`) nunca
 * tenían datos (main: 0 lotes; todo el sistema: 6).
 *
 * Ahora cada línea de la recepción puede traer `expiryDate` (y un `lote`
 * opcional). Si la línea ENTRÓ a stock vendible, nace un lote con lo que
 * entró — nunca la merma: lo dañado o vencido no es stock y no vence.
 *
 * Puro y sin servidor: lo usan el endpoint (validar + armar el lote) y los
 * dos formularios de recepción (atajos +7/+30/+90 y el aviso antes de enviar).
 */
import { limaDateKey } from "@/lib/utils";

/** Atajos del campo «Vence»: a una semana, un mes y tres meses. */
export const ATAJOS_VENCE_DIAS = [7, 30, 90] as const;

/** Más allá de esto es un año mal tipeado (2062 por 2026), no un vencimiento. */
const MAX_ANIOS = 10;

const MS_DIA = 86_400_000;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` real (rechaza 2026-02-30). */
export function esFechaIso(iso: string): boolean {
  if (!ISO.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Suma días a una fecha `YYYY-MM-DD` sin salir de UTC (no la mueve el huso). */
export function sumarDiasIso(iso: string, dias: number): string {
  return new Date(new Date(`${iso}T00:00:00.000Z`).getTime() + dias * MS_DIA).toISOString().slice(0, 10);
}

/** La fecha de un atajo: hoy en Pucallpa + N días. */
export function venceEnDias(dias: number, hoy: string = limaDateKey()): string {
  return sumarDiasIso(hoy, dias);
}

/**
 * Por qué la fecha no sirve, en palabras del encargado; `null` si sirve.
 * Hoy se acepta (vence hoy, todavía se vende); ayer no: eso llegó vencido y
 * va marcado «Vencido», que lo deja fuera del stock.
 */
export function errorDeVencimiento(iso: string, hoy: string = limaDateKey()): string | null {
  if (!esFechaIso(iso)) return "La fecha de vencimiento no es válida";
  if (iso < hoy) return "Esa fecha ya pasó: si llegó vencido, márcalo «Vencido»";
  if (iso > sumarDiasIso(hoy, MAX_ANIOS * 366)) return "Faltan más de 10 años para esa fecha: revisa el año";
  return null;
}

/** Lo que el endpoint necesita de una línea para decidir si nace un lote. */
export type LineaConVence = {
  receivedQty: number;
  condition: "ok" | "dañado" | "vencido" | "faltante";
  expiryDate?: string;
  lote?: string;
};

/** ¿Esta línea pide un lote? Solo si entra a stock vendible y trae fecha. */
export function pideLote(item: LineaConVence): boolean {
  return item.condition === "ok" && item.receivedQty > 0 && !!item.expiryDate?.trim();
}

/** El lote listo para escribir. `indice` = posición de la línea en la recepción. */
export type LoteDeRecepcion = {
  indice: number;
  lote: string;
  productId: number;
  productName: string;
  productCategory: string;
  quantity: number;
  unit: string;
  supplierId: string | null;
  supplierName: string;
  expiryDate: string;
  costUnit: number;
  notes: string;
};

/**
 * Arma el lote de una línea que ya entró a stock. `null` si la línea no pide
 * lote. Sin número de lote del proveedor se usa la referencia de la recepción
 * (REC-XXXXXX): así el lote se encuentra desde la recepción y al revés.
 */
export function armarLoteDeRecepcion(args: {
  indice: number;
  item: LineaConVence;
  ref: string;
  productId: number;
  productName: string;
  productCategory: string;
  unit: string;
  costUnit: number;
  supplierId: string | null;
  supplierName: string;
}): LoteDeRecepcion | null {
  const { item } = args;
  if (!pideLote(item)) return null;
  const expiryDate = item.expiryDate!.trim();
  if (!esFechaIso(expiryDate)) return null;
  const lote = item.lote?.trim() || args.ref;
  return {
    indice: args.indice,
    lote: lote.slice(0, 60),
    productId: args.productId,
    productName: args.productName,
    productCategory: args.productCategory || "Otros",
    quantity: item.receivedQty,
    unit: args.unit || "unidad",
    supplierId: args.supplierId,
    supplierName: args.supplierName,
    expiryDate,
    costUnit: Number.isFinite(args.costUnit) && args.costUnit > 0 ? Math.round(args.costUnit * 100) / 100 : 0,
    notes: `Recepción ${args.ref}`,
  };
}

/** «15/11/2026» desde `2026-11-15`, sin pasar por `Date` (no se corre de día). */
export function textoVence(iso: string): string {
  return esFechaIso(iso) ? iso.split("-").reverse().join("/") : iso;
}

/**
 * Límites para comparar vencimientos por el DÍA de Pucallpa.
 *
 * El lote guarda su fecha a medianoche UTC (`new Date("YYYY-MM-DD")`, igual en
 * el alta manual y en la recepción), que en Lima es la víspera a las 19:00.
 * Comparar contra `new Date()` lo daba «vencido» desde las 19:00 del día
 * anterior: un lote que vence hoy nacía vencido y nunca pasaba por «Por vencer».
 *
 * `hoy` = medianoche UTC de la fecha de hoy en Lima → vigente ⇔ fecha ≥ hoy.
 * `hasta` = último instante de la fecha hoy + `dias` → por vencer ⇔ hoy ≤ fecha ≤ hasta.
 */
export function limitesDeVence(dias = 0, hoyIso: string = limaDateKey()): { hoy: Date; hasta: Date } {
  const hoy = new Date(`${hoyIso}T00:00:00.000Z`);
  return { hoy, hasta: new Date(hoy.getTime() + (Math.max(0, dias) + 1) * MS_DIA - 1) };
}

/**
 * Cuánto de una venta sale de los lotes.
 *
 * El stock del producto = lo que tiene lote + lo que no (todo lo que entró
 * antes de anotar «vence», o sin fecha). La venta no dice de cuál salió: se
 * asume que primero lo sin lote, así el lote —y su aviso de vencimiento— sigue
 * mientras el estante tenga con qué cubrirlo. Ejemplo: Arroz con 108 sin lote
 * y un lote de 2; se venden 2 → el stock queda en 108, que cubre los 108 sin
 * lote, y el lote sigue en 2. Antes el lote bajaba a 0 y el producto salía de
 * «Por vencer» con las 2 bolsas todavía en el estante.
 *
 * Invariante: después de la venta, Σlotes ≤ stock. Nunca más que lo vendido.
 * `stockDespues` = `Product.stock` YA descontado; `null` = el producto no lleva
 * stock: todo sale de los lotes, como antes.
 */
export function cantidadQueSaleDeLotes(args: { vendido: number; sumaLotes: number; stockDespues: number | null }): number {
  const { vendido, sumaLotes, stockDespues } = args;
  if (!(vendido > 0) || !(sumaLotes > 0)) return 0;
  const sobra = stockDespues == null ? sumaLotes : sumaLotes - Math.max(0, stockDespues);
  return Math.round(Math.min(vendido, Math.max(0, sobra)) * 1000) / 1000;
}
