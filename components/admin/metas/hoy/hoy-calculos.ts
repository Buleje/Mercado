/**
 * components/admin/metas/hoy/hoy-calculos.ts — las cuentas de «Hoy» (ADR-488).
 *
 * Todo con la hora de Lima que manda el servidor (`/api/goals/serie`): la del
 * navegador no cuenta (antes `getHours()` de una PC con otra zona movía las
 * ventas de hora). Puro: sin React, sin fetch.
 */
import type { TramoVenta } from "@/lib/metas/logros-reglas";

/** El horario de la bodega con que se arma el ritmo y el pronóstico del día. */
export const HORA_APERTURA = 6;
export const HORA_CIERRE = 21;

/** La meta diaria que traía la pantalla vieja cuando nadie la cambiaba. */
export const META_DIARIA_DE_FABRICA = 3000;

/** «6am», «12pm», «9pm». */
export function etiquetaHora(h: number): string {
  if (h === 0) return "12am";
  if (h < 12) return `${h}am`;
  if (h === 12) return "12pm";
  return `${h - 12}pm`;
}

export interface ResumenDelDia {
  total: number;
  n: number;
  /** Lo que se había vendido AYER hasta esta misma hora (inclusive). */
  ayerAEstaHora: number;
  nAyerAEstaHora: number;
  ayerTotal: number;
  /** % contra ayer a esta hora; `null` si ayer a esta hora iba en 0. */
  deltaVsAyer: number | null;
  mejorHora: { hora: number; total: number; n: number } | null;
}

const sumar = (horas: readonly TramoVenta[], hasta = 23) =>
  horas
    .slice(0, hasta + 1)
    .reduce((a, h) => ({ total: Math.round((a.total + h.total) * 100) / 100, n: a.n + h.n }), {
      total: 0,
      n: 0,
    });

export function resumirDia(
  horas: readonly TramoVenta[],
  horasAyer: readonly TramoVenta[],
  horaActual: number,
): ResumenDelDia {
  const hoy = sumar(horas);
  const ayerHora = sumar(horasAyer, horaActual);
  let mejorHora: ResumenDelDia["mejorHora"] = null;
  horas.forEach((h, hora) => {
    if (h.total > 0 && (!mejorHora || h.total > mejorHora.total))
      mejorHora = { hora, total: h.total, n: h.n };
  });
  return {
    total: hoy.total,
    n: hoy.n,
    ayerAEstaHora: ayerHora.total,
    nAyerAEstaHora: ayerHora.n,
    ayerTotal: sumar(horasAyer).total,
    deltaVsAyer: ayerHora.total > 0 ? ((hoy.total - ayerHora.total) / ayerHora.total) * 100 : null,
    mejorHora,
  };
}

/** Las horas que vale la pena dibujar: desde la primera con ventas (o 8 antes de ahora) hasta la siguiente a la actual. */
export function horasADibujar(
  horas: readonly TramoVenta[],
  horasAyer: readonly TramoVenta[],
  horaActual: number,
): number[] {
  const primera = horas.findIndex((h, i) => h.n > 0 || (horasAyer[i]?.n ?? 0) > 0);
  const desde = Math.max(0, Math.min(primera === -1 ? horaActual - 8 : primera, HORA_APERTURA));
  const hasta = Math.min(23, Math.max(horaActual + 1, HORA_CIERRE));
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
}

/** Qué parte del horario ya pasó (0 antes de abrir, 1 después de cerrar). */
export function fraccionDelHorario(horaActual: number): number {
  if (horaActual < HORA_APERTURA) return 0;
  if (horaActual >= HORA_CIERRE) return 1;
  return (horaActual - HORA_APERTURA + 1) / (HORA_CIERRE - HORA_APERTURA + 1);
}

/** Al céntimo: con `Math.round` a secas S/ 0.10 de venta pronosticaba «cierras con S/ 0». */
const alCentimo = (n: number) => Math.round(n * 100) / 100;

/** A este ritmo, con cuánto cierra el día. `null` antes de abrir. */
export function pronosticoDelDia(total: number, horaActual: number): number | null {
  if (horaActual < HORA_APERTURA) return null;
  if (horaActual >= HORA_CIERRE) return total;
  const pasadas = horaActual - HORA_APERTURA + 1;
  const quedan = HORA_CIERRE - horaActual;
  return alCentimo(total + (total / pasadas) * quedan);
}

export type TonoLinea = "exito" | "aviso" | "error" | "neutro";

/** La línea que dice cómo va el día contra la meta. */
export function lineaDelDia(
  total: number,
  meta: number,
  horaActual: number,
  fmt: (n: number) => string,
): { texto: string; tono: TonoLinea } {
  if (total >= meta) return { texto: `Meta superada por ${fmt(total - meta)}`, tono: "exito" };
  const falta = meta - total;
  if (horaActual < HORA_APERTURA)
    return {
      texto: `Te faltan ${fmt(falta)} · el día arranca a las ${HORA_APERTURA}:00`,
      tono: "neutro",
    };
  if (horaActual >= HORA_CIERRE)
    return { texto: `Día cerrado: faltaron ${fmt(falta)}`, tono: "error" };
  const quedan = HORA_CIERRE - horaActual;
  if (fraccionDelHorario(horaActual) > 0.7 && total < meta / 2) {
    return {
      texto: `Te faltan ${fmt(falta)}: necesitas ${fmt(alCentimo(falta / quedan))} por hora en las ${quedan} h que quedan`,
      tono: "error",
    };
  }
  const pron = pronosticoDelDia(total, horaActual) ?? total;
  return pron >= meta
    ? { texto: `Te faltan ${fmt(falta)} · a este ritmo cierras con ${fmt(pron)}`, tono: "exito" }
    : { texto: `Te faltan ${fmt(falta)} · a este ritmo cierras con ${fmt(pron)}`, tono: "aviso" };
}
