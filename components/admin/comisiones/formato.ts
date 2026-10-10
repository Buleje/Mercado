/**
 * Cómo se escriben las cifras y las fechas en Comisiones (tabla, indicadores,
 * ventas del vendedor). Fechas date-only en UTC y días escritos a mano: no
 * dependen del ICU del navegador (regla de UI del panel).
 */
import { formatNumber } from "@/lib/format";
import { STORE_TIMEZONE } from "@/lib/utils";
import type { Rango } from "@/lib/comisiones/calcular";

export const fmt = (n: number) => `S/ ${formatNumber(n, { min: 2 })}`;

/** «2026-10-09» → «09/10». */
export const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** «01/10–10/10». */
export const tramoDias = (r: Rango) => `${ddmm(r.desde)}–${ddmm(r.hasta)}`;

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** «jueves 09/10» de un día YYYY-MM-DD (o del comienzo de un ISO). */
export function diaConNombre(fecha: string): string {
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return fecha;
  return `${DIAS[d.getUTCDay()]} ${ddmm(fecha)}`;
}

const HORA = new Intl.DateTimeFormat("es-PE", { timeZone: STORE_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false });

/** «05:17» en hora de Lima. */
export function horaLima(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? HORA.format(d) : "";
}

/** Texto semántico chico: `-ink` (el -700 del panel da 4,1:1 en claro). */
export const TONO_PAGADA = "text-[var(--data-success-ink)]";
export const TONO_FALTA = "text-[var(--data-warning-ink)]";
