/**
 * La línea que dice cada bloque del Resumen de Plata cuando está plegado.
 * Sólo arma texto con cifras que el bloque ya tiene: no suma ni calcula montos.
 */
import { formatCurrency } from "@/lib/currency";
import type { DiaFlujo } from "./tipos";

const soles = (n: number) => formatCurrency(n, { decimals: 0 });
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «Gastos S/ 63 · ingresos S/ 0», o qué falta si el mes está vacío. */
export function lineaGastosYPagos(totalGastos: number, totalIngresos: number, hayGastos: boolean, hayIngresos: boolean): string {
  if (!hayGastos && !hayIngresos) return "sin gastos ni ventas este mes";
  return [
    hayGastos ? `gastos ${soles(totalGastos)}` : "sin gastos",
    hayIngresos ? `ingresos ${soles(totalIngresos)}` : "sin ventas",
  ].join(" · ");
}

/** «12 de 30 días con movimiento»: cuántos días del gráfico tienen algo. */
export function lineaFlujo(cashFlow: DiaFlujo[]): string {
  const conMovimiento = cashFlow.filter((d) => d.ingresos > 0 || d.gastos > 0).length;
  return `${conMovimiento} de ${cashFlow.length} días con movimiento`;
}

/** «3 proveedores · 5 fiados» (los que lista el bloque). */
export function lineaDeudores(proveedores: number, fiados: number): string {
  if (proveedores === 0 && fiados === 0) return "sin deudas ni fiados";
  return [plural(proveedores, "proveedor", "proveedores"), plural(fiados, "fiado", "fiados")].join(" · ");
}

/** La palabra del puntaje de salud (mismos cortes que el bloque: >70, ≥40). */
export function etiquetaSalud(total: number): string {
  return total > 70 ? "Saludable" : total >= 40 ? "Precaución" : "Crítico";
}

/** Lo que encontró el detector de fugas, en una línea. */
export function lineaFugas(estado: { cargando: boolean; error: string | null; fugas: number; extra: number }): string {
  if (estado.cargando) return "revisando los últimos 3 meses…";
  if (estado.error) return "no se pudo revisar";
  if (estado.fugas === 0) return "sin fugas";
  return `${plural(estado.fugas, "categoría con fuga", "categorías con fuga")} · ${soles(estado.extra)} sobre el promedio`;
}
