/**
 * Fechas de «Me deben» como se leen en la bodega: «jueves 10/09», en el día de
 * Lima. Una fecha elegida en un calendario (vencimiento, promesa) llega como
 * medianoche UTC: ésa se lee tal cual, porque pasada a Lima caería el día
 * anterior. Un momento (un cobro, un fiado) se pasa a Lima.
 */
import { diaConNombre } from "@/lib/gastos/lista-gastos";
import { diaDe } from "@/lib/fiados/gestion-cobranza";

/** `diaDe` y `diasEntre` viven en `lib/fiados` (10-10): las promesas también se cuentan por día de Lima. */
export { diaDe, diasEntre } from "@/lib/fiados/gestion-cobranza";

/** «jueves 10/09». */
export function diaLeido(fecha: string | null | undefined): string {
  const d = diaDe(fecha);
  return d ? diaConNombre(d) : "sin fecha";
}
