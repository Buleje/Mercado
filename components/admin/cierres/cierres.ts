/**
 * Tipos y textos de «Cierres del día» (PURO).
 *
 * La fecha del cierre es un día de calendario guardado a medianoche UTC. Antes
 * se pintaba en la hora local del navegador: en Pucallpa (UTC−5) el cierre del
 * sábado 10/10 decía «vie 09 oct».
 */
import { diaConNombre } from "@/components/admin/inventario/movimientos/tipos";
import { formatCurrency } from "@/lib/format";

export type CierreDelDia = {
  id: string;
  fecha: string;
  totalVentas: number;
  cantidadVentas: number;
  ticketPromedio: number;
  efectivoContado: number | null;
  efectivoEsperado: number;
  diferenciaCaja: number;
  fiadosCobrados: number;
  fiadosNuevos: number;
  fiadosVencidos: number;
  mejorHora: string | null;
  productoTop: string | null;
  stockAlertas: string | null;
  notas: string | null;
  creadoPor: string;
  createdAt: string;
};

/** «sábado 10/10», con el año si no es el de hoy («sábado 10/10/2025»). */
export function fechaDelCierre(fecha: string, anioActual = new Date().getUTCFullYear()): string {
  const dia = diaConNombre(fecha);
  return fecha.slice(0, 4) === String(anioActual) ? dia : `${dia}/${fecha.slice(0, 4)}`;
}

/** El cuadre en palabras: «Sin contar», «Cuadra», «+S/ 0.50» (sobra) o «−S/ 2.00» (falta). */
export function textoDiferencia(c: Pick<CierreDelDia, "efectivoContado" | "diferenciaCaja">): { texto: string; clase: string } {
  if (c.efectivoContado == null) return { texto: "Sin contar", clase: "font-normal text-[var(--text-secondary)]" };
  const d = Math.round(Number(c.diferenciaCaja) * 100) / 100;
  if (d === 0) return { texto: "Cuadra", clase: "text-[var(--data-success-ink)]" };
  return d > 0
    ? { texto: `+${formatCurrency(d)}`, clase: "text-[var(--data-success-ink)]" }
    : { texto: `−${formatCurrency(Math.abs(d))}`, clase: "text-[var(--data-error-ink)]" };
}
