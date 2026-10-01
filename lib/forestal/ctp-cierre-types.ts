/**
 * ctp-cierre-types — tipos + helpers PUROS (client-safe) del cierre de período
 * del Libro de Operaciones CTP (ADR-139).
 *
 * El LO-CTP se lleva por período (mes). Cerrar un mes lo convierte en un acta
 * INMUTABLE: congela costos, snapshotea la existencia de cierre (= existencia de
 * apertura del mes siguiente, continuidad rollforward) y bloquea toda edición de
 * las líneas fechadas en el mes. Esto es lo que hace del "libro" un libro de
 * verdad y no una query viva sobre datos mutables — lo primero que desconfía un
 * inspector OSINFOR.
 *
 * Sin server-only: lo consume tanto la DB class (server) como el panel (client).
 */

/** Existencia congelada al cierre — la foto que hereda el mes siguiente. */
export interface CtpSaldoSnapshot {
  materiaPrima: { especie: string; cientifico: string | null; cites: boolean; existenciaM3: number }[];
  productos: { producto: string; existencia: number }[];
}

export interface CtpCierrePeriodo {
  /** "YYYY-MM" (mes local) — identidad + orden. */
  periodKey: string;
  /** Instantes ISO inclusivos del mes cerrado. */
  from: string;
  to: string;
  /** "mayo de 2026". */
  label: string;
  closedAt: string;
  closedBy: string;
  /** Existencia de cierre acumulada hasta `to` (apertura del período siguiente). */
  saldoCierre: CtpSaldoSnapshot;
  totales: {
    ingresosCount: number;
    volumenIngresado: number;
    corridas: number;
    despachos: number;
    corridasCongeladas: number;
    corridasSinCostear: number;
    especiesEnNegativo: number;
  };
  /** Si se reabrió: el cierre queda en el historial pero deja de bloquear. */
  reabierto?: { at: string; by: string; motivo: string } | null;
}

/** Rango local + clave de un mes (0-based), alineado con ctp-period.ts. */
export function monthRange(year: number, month0: number): { from: Date; to: Date; periodKey: string; label: string } {
  const from = new Date(year, month0, 1, 0, 0, 0, 0);
  const to = new Date(year, month0 + 1, 0, 23, 59, 59, 999);
  const periodKey = `${year}-${String(month0 + 1).padStart(2, "0")}`;
  const label = from.toLocaleDateString("es-PE", { month: "long", year: "numeric" });
  return { from, to, periodKey, label };
}

/** "YYYY-MM" del instante `d` (hora local). */
export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * ¿La fecha cae en un período CERRADO y no reabierto? Compara instantes
 * absolutos (from/to son ISO local-computados; date es el entryDate) → sin
 * corrimiento de zona horaria.
 */
export function isDateClosed(cierres: CtpCierrePeriodo[], date: Date): boolean {
  const t = date.getTime();
  if (Number.isNaN(t)) return false;
  return cierres.some((c) => !c.reabierto && t >= new Date(c.from).getTime() && t <= new Date(c.to).getTime());
}

/** El cierre activo (no reabierto) que contiene la fecha, o null. */
export function closedPeriodOf(cierres: CtpCierrePeriodo[], date: Date): CtpCierrePeriodo | null {
  const t = date.getTime();
  if (Number.isNaN(t)) return null;
  return cierres.find((c) => !c.reabierto && t >= new Date(c.from).getTime() && t <= new Date(c.to).getTime()) ?? null;
}
