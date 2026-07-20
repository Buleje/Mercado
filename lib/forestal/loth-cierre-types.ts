/**
 * loth-cierre-types — tipos + helpers PUROS (client-safe) del cierre de período
 * del Libro de Operaciones de Títulos Habilitantes (LO-TH).
 *
 * Cerrar un mes lo vuelve un acta INMUTABLE: bloquea toda edición de las líneas
 * fechadas en ese mes. Es lo que hace del "libro" un libro de verdad y no una
 * query viva sobre datos mutables — lo primero que desconfía un inspector OSINFOR.
 *
 * MÁS SIMPLE que el cierre del CTP (ADR-139): el LO-TH NO congela costos (el
 * costeo es derivado on-read) ni snapshotea existencia de apertura — sólo bloquea
 * el mes. Reusa los helpers de mes genéricos de `ctp-cierre-types`.
 */

import { monthRange, monthKeyOf } from "./ctp-cierre-types";

export { monthRange, monthKeyOf };

export interface LothCierrePeriodo {
  /** "YYYY-MM" (mes local) — identidad + orden. */
  periodKey: string;
  /** Instantes ISO inclusivos del mes cerrado. */
  from: string;
  to: string;
  /** "mayo de 2026". */
  label: string;
  closedAt: string;
  closedBy: string;
  totales: {
    lineasCount: number;
    taladoM3: number;
    trozadoM3: number;
  };
  /** Si se reabrió: el cierre queda en el historial pero deja de bloquear. */
  reabierto?: { at: string; by: string; motivo: string } | null;
}

/** ¿La fecha cae en un período CERRADO y no reabierto? Guard de escritura. */
export function isDateClosed(cierres: LothCierrePeriodo[], date: Date): boolean {
  const t = date.getTime();
  if (Number.isNaN(t)) return false;
  return cierres.some((c) => !c.reabierto && t >= new Date(c.from).getTime() && t <= new Date(c.to).getTime());
}

/** El cierre activo (no reabierto) que contiene la fecha, o null. */
export function closedPeriodOf(cierres: LothCierrePeriodo[], date: Date): LothCierrePeriodo | null {
  const t = date.getTime();
  if (Number.isNaN(t)) return null;
  return cierres.find((c) => !c.reabierto && t >= new Date(c.from).getTime() && t <= new Date(c.to).getTime()) ?? null;
}
