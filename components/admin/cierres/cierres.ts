/**
 * Tipos y textos de «Cierres del día» (PURO).
 *
 * La fecha del cierre es un día de calendario guardado a medianoche UTC. Antes
 * se pintaba en la hora local del navegador: en Pucallpa (UTC−5) el cierre del
 * sábado 10/10 decía «vie 09 oct».
 */
import { diaConNombre } from "@/components/admin/inventario/movimientos/tipos";
import { camposDeCajaDelResumen, type DiaDeCaja } from "@/lib/caja/cierres-por-dia";
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
  /** El día no tiene resumen guardado (nadie cerró el día ni corrió el cron): sin fiados que mostrar. */
  sinResumen?: boolean;
};

/**
 * La ficha de un día de Caja › Historial › Por día: ventas y cuadre del
 * servidor (cajas cerradas), fiados/stock/notas del resumen guardado. Sin
 * cuentas: todo viene armado de `/api/cash-registers/por-dia`.
 */
export function cierreDeDia(d: DiaDeCaja): CierreDelDia {
  const r = d.resumen;
  return {
    id: r?.id ?? d.dia,
    fecha: `${d.dia}T00:00:00.000Z`,
    totalVentas: d.ventas.total,
    cantidadVentas: d.ventas.cantidad,
    ticketPromedio: d.ventas.ticket,
    ...camposDeCajaDelResumen(d.cuadre),
    fiadosCobrados: r?.fiadosCobrados ?? 0,
    fiadosNuevos: r?.fiadosNuevos ?? 0,
    fiadosVencidos: r?.fiadosVencidos ?? 0,
    mejorHora: r?.mejorHora ?? null,
    productoTop: r?.productoTop ?? null,
    stockAlertas: r?.stockAlertas ?? null,
    notas: r?.notas ?? null,
    creadoPor: r?.creadoPor ?? "",
    createdAt: r ? String(r.createdAt) : "",
    sinResumen: !r,
  };
}

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
