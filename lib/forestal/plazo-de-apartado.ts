/**
 * El plazo de una reserva del patio (ADR-418): en qué anda y cómo se nombra.
 *
 * PURO y sin JSX. Vivía dentro de `components/admin/forestal/ctp-celda-apartado.tsx`,
 * que es un módulo `"use client"`: desde el servidor sus funciones llegan como
 * referencias de cliente y no se pueden llamar. Los pendientes del libro cuentan
 * las reservas vencidas EN EL SERVIDOR (2026-09-23), y tenían que hacerlo con esta
 * misma cuenta — no con una parecida. La celda la re-exporta tal cual.
 *
 * Fechas: `hasta` es date-only («2026-09-22» = medianoche UTC) y se lee en UTC;
 * `ahora` es un instante real y se lleva al día civil de Lima antes de restar. Al
 * revés, pasadas las 19:00 de Pucallpa la reserva «vencía» un día antes.
 */

import { limaDateKey } from "@/lib/utils";

export type EstadoApartado = "vencido" | "vence-hoy" | "por-vencer" | "vigente" | "sin-plazo";

export interface PlazoDeApartado {
  estado: EstadoApartado;
  /** Días de hoy al plazo: negativo = ya venció. `null` cuando no hay plazo. */
  dias: number | null;
  /** Cómo se lee el plazo en la pastilla. */
  texto: string;
}

const DIA_MS = 86_400_000;
/* Escritos a mano y no con `Intl`: el nombre del día cambia de mayúscula según
   la versión de ICU (regla ui-components), y el patio lee «lunes 22/09». */
const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** Medianoche UTC de una fecha date-only del libro (aritmética sin off-by-one Lima). */
const aUtc = (clave: string): number => Date.parse(`${clave.slice(0, 10)}T00:00:00.000Z`);

/** El plazo que proponen los atajos del modal: hoy + N días, en clave del libro. */
export const sumarDias = (clave: string, dias: number): string =>
  new Date(Date.parse(`${clave}T00:00:00.000Z`) + dias * DIA_MS).toISOString().slice(0, 10);

/** «10/09» — lo que entra en una pastilla de tabla. La fecha completa va en el title. */
export const fechaCorta = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}` : iso;
};

/** «jueves 10/09» — el formato en el que se habla de un plazo en el patio. */
export const diaConNombre = (iso: string): string => {
  const t = aUtc(iso);
  if (!Number.isFinite(t)) return iso;
  return `${DIAS_SEMANA[new Date(t).getUTCDay()]} ${fechaCorta(iso)}`;
};

/**
 * En qué anda el plazo de una reserva.
 *
 * Una sola fórmula para la celda, el modal y los pendientes del libro: vencida es
 * `hasta` ANTERIOR al día de hoy en Lima — por día, nunca por hora. Una reserva
 * «hasta el lunes» vale el lunes entero.
 */
export function plazoDeApartado(hasta: string | null, ahora: Date = new Date()): PlazoDeApartado {
  if (!hasta) return { estado: "sin-plazo", dias: null, texto: "sin plazo" };
  const fin = aUtc(hasta);
  if (!Number.isFinite(fin)) return { estado: "sin-plazo", dias: null, texto: "sin plazo" };
  const dias = Math.round((fin - aUtc(limaDateKey(ahora))) / DIA_MS);
  if (dias < 0) {
    const n = -dias;
    return { estado: "vencido", dias, texto: `venció hace ${n} día${n === 1 ? "" : "s"}` };
  }
  if (dias === 0) return { estado: "vence-hoy", dias, texto: "vence hoy" };
  if (dias === 1) return { estado: "por-vencer", dias, texto: "vence mañana" };
  if (dias <= 3) return { estado: "por-vencer", dias, texto: `vence en ${dias} días` };
  return { estado: "vigente", dias, texto: `hasta ${fechaCorta(hasta)}` };
}
