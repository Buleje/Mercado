/**
 * Devoluciones a proveedores — textos que escribe el servidor en la devolución
 * (origen, anulación, reingreso). Sin columnas nuevas (noche 17-10, sin
 * migraciones): quedan como líneas fijas al final de `notas`, legibles por una
 * persona y nunca editadas después.
 */
import { formatDateNumeric, formatWeekday, type FechaInput } from "@/lib/format";

/** «jueves 17/10» (con año si no es el actual), en hora de Lima. */
export function diaYFecha(v: FechaInput): string {
  const numerica = formatDateNumeric(v);
  const anio = numerica.slice(6);
  const esteAnio = formatDateNumeric(new Date()).slice(6);
  return `${formatWeekday(v, { largo: true })} ${anio === esteAnio ? numerica.slice(0, 5) : numerica}`;
}

/** Qué pasó con la mercadería al anular. */
export type StockAlAnular = "no-salio" | "volvio" | "sigue-fuera";

export function lineaDeAnulacion(p: { fecha: FechaInput; usuario: string; motivo: string; stock: StockAlAnular }): string {
  const stock =
    p.stock === "volvio" ? " La mercadería volvió al almacén y regresó al inventario."
    : p.stock === "sigue-fuera" ? " La mercadería sigue fuera del almacén: el inventario no cambió."
    : "";
  return `Anulada el ${diaYFecha(p.fecha)} por ${p.usuario}: ${p.motivo.trim()}.${stock}`;
}

export function lineaDeReingreso(p: { fecha: FechaInput; usuario: string }): string {
  return `La mercadería volvió al almacén el ${diaYFecha(p.fecha)} (lo marcó ${p.usuario}) y regresó al inventario.`;
}

/** Suma una línea a las notas sin perder lo que había. */
export function sumarANotas(notas: string | null | undefined, linea: string): string {
  return [notas?.trim(), linea].filter(Boolean).join("\n");
}
