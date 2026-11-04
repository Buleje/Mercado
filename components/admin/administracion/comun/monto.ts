/**
 * El monto con su moneda: soles con el formato de siempre («S/ 1,200») y
 * dólares dichos («US$ 1,200»), nunca un número pelado. Sólo formatea: los
 * montos llegan redondeados del servidor (ADR-524).
 */
import { soles } from "@/lib/adelantos/tope";
import type { Moneda } from "@/lib/admin/fichas-tramites-alquileres";

export function monto(n: number, moneda: Moneda = "PEN"): string {
  const s = soles(n);
  return moneda === "USD" ? s.replace("S/", "US$") : s;
}
