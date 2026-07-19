/**
 * cacao-cierre-types — tipos + helpers PUROS (client-safe) del cierre de período
 * del acopio de cacao (ADR-303). Espeja el cierre forestal (ADR-139): cerrar un
 * mes congela los KPIs de la campaña en un acta inmutable, snapshotea el stock de
 * cierre (= apertura del mes siguiente, rollforward) y BLOQUEA la edición de
 * lotes/ventas/beneficios/ajustes fechados en el mes. Hoy editar un lote pasado
 * altera el histórico en silencio — inaceptable para banco/comprador/auditoría.
 */

/** Existencia + KPIs congelados al cierre. El stock hereda al mes siguiente. */
export interface CacaoSnapshot {
  /** kg de grano en existencia acumulados al cierre (acopio − ventas − mermas). */
  stockKg: number;
  acopioKg: number;
  ventasKg: number;
  mermasKg: number;
  /** S/ pagado a productores y S/ cobrado de ventas, acumulados. */
  pagadoProductores: number;
  cobradoVentas: number;
  porGrado: { grado: string; kg: number }[];
}

export interface CacaoCierrePeriodo {
  periodKey: string; // "YYYY-MM"
  from: string;
  to: string;
  label: string;
  closedAt: string;
  closedBy: string;
  /** Acumulado hasta `to` (apertura del período siguiente). */
  snapshot: CacaoSnapshot;
  /** Movimientos del propio mes (para el acta del cierre). */
  totales: { lotes: number; acopioKg: number; ventas: number; ventasKg: number; montoVentasPen: number; mermasKg: number };
  reabierto?: { at: string; by: string; motivo: string } | null;
}

/** Rango local + clave de un mes (0-based), alineado con los períodos del módulo. */
export function monthRange(year: number, month0: number): { from: Date; to: Date; periodKey: string; label: string } {
  const from = new Date(year, month0, 1, 0, 0, 0, 0);
  const to = new Date(year, month0 + 1, 0, 23, 59, 59, 999);
  const periodKey = `${year}-${String(month0 + 1).padStart(2, "0")}`;
  const label = from.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  return { from, to, periodKey, label };
}

/** ¿La fecha cae en un período CERRADO y no reabierto? Compara instantes absolutos. */
export function isDateClosed(cierres: CacaoCierrePeriodo[], date: Date): boolean {
  const t = date.getTime();
  if (Number.isNaN(t)) return false;
  return cierres.some((c) => !c.reabierto && t >= new Date(c.from).getTime() && t <= new Date(c.to).getTime());
}

/** El cierre activo (no reabierto) que contiene la fecha, o null. */
export function closedPeriodOf(cierres: CacaoCierrePeriodo[], date: Date): CacaoCierrePeriodo | null {
  const t = date.getTime();
  if (Number.isNaN(t)) return null;
  return cierres.find((c) => !c.reabierto && t >= new Date(c.from).getTime() && t <= new Date(c.to).getTime()) ?? null;
}
