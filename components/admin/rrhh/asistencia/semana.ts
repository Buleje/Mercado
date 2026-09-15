/**
 * semana.ts — cómo se nombra una semana de la hoja de asistencia (ADR-416).
 *
 * Semana de lunes a domingo, como el resto de RRHH (ADR-414). Meses escritos a
 * mano (`NOMBRES_MES`), no `Intl`.
 */

import { NOMBRES_MES, dateDeFechaKey, sumarDias } from "@/lib/rrhh/fechas";
import type { FechaKey } from "@/lib/rrhh/tipos";

const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

/** «Lun», «Mar»… — lunes primero. */
export function nombreCortoDelDia(fecha: FechaKey): string {
  return DIAS_CORTOS[(dateDeFechaKey(fecha).getUTCDay() + 6) % 7];
}

/** «Lun 14». */
export function encabezadoDia(fecha: FechaKey): string {
  return `${nombreCortoDelDia(fecha)} ${fecha.slice(8, 10)}`;
}

/** «14 al 20 de setiembre de 2026»; si la semana cruza de mes o de año, lo dice. */
export function etiquetaSemana(lunes: FechaKey): string {
  const domingo = sumarDias(lunes, 6);
  const mes = (key: FechaKey) => NOMBRES_MES[Number(key.slice(5, 7)) - 1];
  const dia = (key: FechaKey) => Number(key.slice(8, 10));
  const anio = (key: FechaKey) => key.slice(0, 4);
  if (anio(lunes) !== anio(domingo)) {
    return `${dia(lunes)} de ${mes(lunes)} de ${anio(lunes)} al ${dia(domingo)} de ${mes(domingo)} de ${anio(domingo)}`;
  }
  if (lunes.slice(5, 7) !== domingo.slice(5, 7)) {
    return `${dia(lunes)} de ${mes(lunes)} al ${dia(domingo)} de ${mes(domingo)} de ${anio(domingo)}`;
  }
  return `${dia(lunes)} al ${dia(domingo)} de ${mes(domingo)} de ${anio(domingo)}`;
}

/** 5.5 → «5.5»; 5 → «5». */
export function formatearDias(n: number): string {
  return n.toLocaleString("es-PE", { maximumFractionDigits: 1 });
}
