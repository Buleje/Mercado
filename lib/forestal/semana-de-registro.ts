/**
 * semana-de-registro.ts — la semana de trabajo del aserradero, en días sueltos.
 *
 * El Libro CTP se registra **día por día**: una corrida es una jornada de la
 * sierra, no un mes. Pero el parte de producción rara vez se carga el mismo día
 * —la sierra cortó el sábado, el papel llega el lunes—, así que al declarar hay
 * que poder decir «esto fue el martes 15», no pelearse con un calendario.
 *
 * Este módulo es la aritmética de esa tira de días: qué siete días componen la
 * semana de una fecha, cómo se corre a la semana anterior o siguiente y cómo se
 * etiqueta cada casillero. Nada de datos, nada de red.
 *
 * ## Por qué todo es UTC
 *
 * Las fechas del Libro son **date-only** (`entryDate`, `gtfDate`): viajan como
 * `"2026-09-14"` y se formatean con `timeZone: "UTC"` en todo el módulo
 * forestal. Si acá se usara la hora local del navegador, un tablet con la zona
 * mal configurada correría la tira un día y el operador tildaría el martes
 * creyendo que tilda el lunes. Sumar días sobre medianoche UTC además no tiene
 * horario de verano que lo mueva.
 *
 * El «hoy» sí es de Lima (`limaDateKey`): a las 20:00 de Pucallpa el UTC ya está
 * en el día siguiente, y ahí es cuando el encargado carga el parte del día.
 *
 * PURO y client-safe.
 */

import { limaDateKey } from "@/lib/utils";

/** Los nombres cortos de la tira, empezando en lunes (como una semana de trabajo). */
export const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

/** Los nombres largos, para el título del casillero y el lector de pantalla. */
export const DIAS_LARGOS = [
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
  "domingo",
] as const;

const MS_DIA = 86_400_000;

/**
 * Los meses, escritos acá y no pedidos a `Intl`.
 *
 * `toLocaleDateString("es-PE")` devuelve «Setiembre» con mayúscula según la
 * versión de ICU del runtime: el mismo título se leía distinto en el servidor y
 * en el navegador, y un test sobre eso es un test que se rompe solo al
 * actualizar Node. Va «setiembre», que es como se escribe en Perú.
 */
const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "setiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** `true` si el texto es una fecha `YYYY-MM-DD` que existe de verdad. */
export function esIsoValido(iso: string | null | undefined): boolean {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00.000Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** Hoy en Pucallpa, como clave `YYYY-MM-DD`. */
export function hoyEnLima(): string {
  return limaDateKey();
}

/** Suma (o resta) días a una fecha date-only, sin salir de UTC. */
export function sumarDias(iso: string, dias: number): string {
  const base = new Date(`${iso}T00:00:00.000Z`).getTime();
  return new Date(base + dias * MS_DIA).toISOString().slice(0, 10);
}

/**
 * El lunes de la semana que contiene `iso`.
 *
 * La semana arranca en **lunes** y no en domingo: es la semana de trabajo del
 * aserradero, y poner el domingo primero deja el sábado —día de sierra— al
 * final de la tira anterior.
 */
export function lunesDe(iso: string): string {
  const dow = new Date(`${iso}T00:00:00.000Z`).getUTCDay(); // 0 = domingo
  return sumarDias(iso, -((dow + 6) % 7));
}

/** Los siete días de la semana de `iso`, de lunes a domingo. */
export function diasDeLaSemana(iso: string): string[] {
  const lunes = lunesDe(iso);
  return Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i));
}

/** La misma semana corrida `n` semanas (negativo = hacia atrás). */
export function correrSemanas(iso: string, n: number): string {
  return sumarDias(lunesDe(iso), n * 7);
}

/** El rango de la semana de `iso`, listo para pedirle datos al servidor. */
export function rangoDeLaSemana(iso: string): { desde: string; hasta: string } {
  const dias = diasDeLaSemana(iso);
  return { desde: dias[0]!, hasta: dias[6]! };
}

/** `"14/09"` — lo que se lee en el casillero. */
export function etiquetaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** `0..6` — la posición del día en la tira (lunes = 0). */
export function indiceDelDia(iso: string): number {
  return (new Date(`${iso}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

/** `"Lun"` / `"lunes"`, según cómo se vaya a leer. */
export function nombreDelDia(iso: string, largo = false): string {
  const i = indiceDelDia(iso);
  return largo ? DIAS_LARGOS[i]! : DIAS_CORTOS[i]!;
}

/**
 * `"lunes 14/09"` — cómo se nombra una jornada en voz alta.
 *
 * Con el año sólo cuando NO es el de referencia: «lunes 14/09/2025» en una tira
 * de 2026 avisa que se fue de año, y repetir «/2026» siete veces no dice nada.
 */
export function etiquetaLarga(iso: string, referencia = hoyEnLima()): string {
  const anio = iso.slice(0, 4);
  const sufijo = anio === referencia.slice(0, 4) ? "" : `/${anio}`;
  return `${nombreDelDia(iso, true)} ${etiquetaCorta(iso)}${sufijo}`;
}

/**
 * El título de la tira: `"8 – 14 de setiembre"`, o con los dos meses cuando la
 * semana los cruza. Es lo que le dice al operador en qué semana está parado sin
 * hacerle leer los siete casilleros.
 */
export function tituloDeLaSemana(iso: string): string {
  const { desde, hasta } = rangoDeLaSemana(iso);
  const mes = (d: string) => MESES[Number(d.slice(5, 7)) - 1] ?? "";
  const dia = (d: string) => String(Number(d.slice(8, 10)));
  const anio = desde.slice(0, 4) === hasta.slice(0, 4) ? desde.slice(0, 4) : null;
  return mes(desde) === mes(hasta)
    ? `${dia(desde)} – ${dia(hasta)} de ${mes(desde)}${anio ? ` ${anio}` : ""}`
    : `${dia(desde)} ${mes(desde)} – ${dia(hasta)} ${mes(hasta)}${anio ? ` ${anio}` : ""}`;
}
