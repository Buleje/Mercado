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

/** Al céntimo: con `Math.round` a secas S/ 0.10 de venta pronosticaba «cierras con S/ 0». */
const alCentimo = (n: number) => Math.round(n * 100) / 100;

/** Lo vendido hasta una hora y en todo el día. */
export interface CorteDelDia {
  aEstaHora: number;
  total: number;
}

export interface HoraDeVenta {
  hora: number;
  total: number;
  n: number;
}

export interface ResumenDelDia {
  total: number;
  n: number;
  /** Ayer hasta esta misma hora (inclusive) y entero. */
  ayer: CorteDelDia;
  /** El mismo día de la semana pasada, hasta esta hora y entero. */
  semana: CorteDelDia;
  /** Con cuánto cierra hoy (proyección, no dato). `null` si no hay con qué estimarlo. */
  cierre: CierreEstimado | null;
  /** La hora más fuerte del mismo día de la semana pasada que todavía no llegó. */
  horaFuerte: HoraDeVenta | null;
}

const sumar = (horas: readonly TramoVenta[], hasta = 23) =>
  horas
    .slice(0, hasta + 1)
    .reduce((a, h) => ({ total: Math.round((a.total + h.total) * 100) / 100, n: a.n + h.n }), {
      total: 0,
      n: 0,
    });

const corte = (horas: readonly TramoVenta[], horaActual: number): CorteDelDia => ({
  aEstaHora: sumar(horas, horaActual).total,
  total: sumar(horas).total,
});

export interface CierreEstimado {
  monto: number;
  /**
   * `semana`: lo de hoy + lo que el mismo día de la semana pasada se vendió
   * DESPUÉS de esta hora. `ritmo`: lo de hoy estirado al horario (sin semana pasada).
   */
  base: "semana" | "ritmo";
}

/**
 * Con cuánto cierra el día. Primero con la semana pasada: «si de aquí al
 * cierre vendes lo mismo que ese día desde esta hora» (sirve aun sin ventas
 * hoy, y no se dispara como un cociente cuando a esta hora iba casi en 0).
 * Sin semana pasada, el ritmo de hoy dentro del horario. Sin nada: `null`.
 */
export function cierreEstimado(
  total: number,
  horaActual: number,
  semana: CorteDelDia,
): CierreEstimado | null {
  if (semana.total > 0)
    return { monto: alCentimo(total + Math.max(0, semana.total - semana.aEstaHora)), base: "semana" };
  if (!(total > 0) || horaActual >= HORA_CIERRE) return null;
  const p = pronosticoDelDia(total, horaActual);
  return p === null ? null : { monto: p, base: "ritmo" };
}

/** La hora con más venta, DESPUÉS de la actual, en `horas` (el mismo día de la semana pasada). */
export function horaFuerteQueViene(
  horas: readonly TramoVenta[],
  horaActual: number,
): HoraDeVenta | null {
  let mejor: HoraDeVenta | null = null;
  horas.forEach((h, hora) => {
    if (hora > horaActual && h.total > 0 && (!mejor || h.total > mejor.total))
      mejor = { hora, total: h.total, n: h.n };
  });
  return mejor;
}

export function resumirDia(
  horas: readonly TramoVenta[],
  horasAyer: readonly TramoVenta[],
  horasSemana: readonly TramoVenta[],
  horaActual: number,
): ResumenDelDia {
  const hoy = sumar(horas);
  const semana = corte(horasSemana, horaActual);
  return {
    total: hoy.total,
    n: hoy.n,
    ayer: corte(horasAyer, horaActual),
    semana,
    cierre: cierreEstimado(hoy.total, horaActual, semana),
    horaFuerte: horaFuerteQueViene(horasSemana, horaActual),
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

/** A este ritmo, con cuánto cierra el día. `null` antes de abrir. */
export function pronosticoDelDia(total: number, horaActual: number): number | null {
  if (horaActual < HORA_APERTURA) return null;
  if (horaActual >= HORA_CIERRE) return total;
  const pasadas = horaActual - HORA_APERTURA + 1;
  const quedan = HORA_CIERRE - horaActual;
  return alCentimo(total + (total / pasadas) * quedan);
}

export type TonoLinea = "exito" | "aviso" | "error" | "neutro";

/**
 * La línea que dice cómo va el día contra la meta y qué hace falta para
 * llegar: cuánto por hora en lo que queda del horario. El tono sale del
 * cierre estimado (el mismo de «Indicadores»), no de otra cuenta.
 */
export function lineaDelDia(
  total: number,
  meta: number,
  horaActual: number,
  fmt: (n: number) => string,
  cierre: number | null = null,
): { texto: string; tono: TonoLinea } {
  if (total >= meta) return { texto: `Meta superada por ${fmt(alCentimo(total - meta))}`, tono: "exito" };
  const falta = alCentimo(meta - total);
  if (horaActual < HORA_APERTURA)
    return {
      texto: `Te faltan ${fmt(falta)} · el día arranca a las ${HORA_APERTURA}:00`,
      tono: "neutro",
    };
  if (horaActual >= HORA_CIERRE)
    return { texto: `Día cerrado: faltaron ${fmt(falta)}`, tono: "error" };
  const quedan = HORA_CIERRE - horaActual;
  const texto = `Te faltan ${fmt(falta)}: vende ${fmt(alCentimo(falta / quedan))} por hora en ${
    quedan === 1 ? "la hora que queda" : `las ${quedan} h que quedan`
  }`;
  if (cierre !== null && cierre >= meta) return { texto, tono: "exito" };
  if (fraccionDelHorario(horaActual) > 0.7 && total < meta / 2) return { texto, tono: "error" };
  return { texto, tono: "aviso" };
}
