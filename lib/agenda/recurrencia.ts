/**
 * Agenda (ADR-501 §3) — ¿qué días toca una actividad? Puro y sin zona horaria:
 * trabaja sobre claves «YYYY-MM-DD» (día de Lima ya resuelto por quien llama) con
 * aritmética UTC, así un día nunca se corre por la hora del servidor.
 *
 * Reglas:
 *  · una_vez     → sólo `desde`.
 *  · diaria      → cada día en `diasSemana` (vacío = todos; el Zod exige ≥1).
 *  · semanal     → cada semana, los días de `diasSemana`.
 *  · quincenal   → semanas alternas contando desde la semana (lunes a domingo) de
 *                  `desde`, los días de `diasSemana`.
 *  · mensual     → el `diaMes`; 31 (o un día que el mes no tiene) = último día del mes.
 *  · cada_n_dias → `desde`, `desde + n`, `desde + 2n`…
 * Siempre dentro de [desde, hasta] (hasta NULL = sin fin).
 */
import { diasEntre } from "./schemas";
import type { FechaKey, Recurrencia } from "./tipos";

const MS_DIA = 86_400_000;

function aUtc(fecha: FechaKey): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function aClave(d: Date): FechaKey {
  return d.toISOString().slice(0, 10);
}

export function sumarDias(fecha: FechaKey, dias: number): FechaKey {
  return aClave(new Date(aUtc(fecha).getTime() + dias * MS_DIA));
}

/** 0 = domingo … 6 = sábado. */
export function diaSemanaDe(fecha: FechaKey): number {
  return aUtc(fecha).getUTCDay();
}

export function ultimoDiaDelMes(fecha: FechaKey): number {
  const d = aUtc(fecha);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

/** Lunes de la semana de `fecha` (semana lunes a domingo, como se cuenta en Perú). */
function lunesDe(fecha: FechaKey): FechaKey {
  return sumarDias(fecha, -((diaSemanaDe(fecha) + 6) % 7));
}

function enDias(r: Recurrencia, fecha: FechaKey): boolean {
  return r.diasSemana.length === 0 || r.diasSemana.includes(diaSemanaDe(fecha));
}

/** ¿La actividad toca en `fecha`? */
export function tocaEn(r: Recurrencia, fecha: FechaKey): boolean {
  if (fecha < r.desde) return false;
  if (r.hasta !== null && fecha > r.hasta) return false;
  switch (r.frecuencia) {
    case "una_vez":
      return fecha === r.desde;
    case "diaria":
    case "semanal":
      return enDias(r, fecha);
    case "quincenal": {
      const semana = Math.floor(diasEntre(lunesDe(r.desde), fecha) / 7);
      return semana % 2 === 0 && enDias(r, fecha);
    }
    case "mensual": {
      if (r.diaMes === null) return false;
      const dia = Number(fecha.slice(8, 10));
      return dia === Math.min(r.diaMes, ultimoDiaDelMes(fecha));
    }
    case "cada_n_dias": {
      const n = r.cadaN ?? 0;
      return n >= 1 && diasEntre(r.desde, fecha) % n === 0;
    }
  }
}

/** Días en que toca dentro de [desde, hasta] (ambos incluidos), en orden. */
export function fechasEnRango(r: Recurrencia, desde: FechaKey, hasta: FechaKey): FechaKey[] {
  const inicio = desde < r.desde ? r.desde : desde;
  const fin = r.hasta !== null && r.hasta < hasta ? r.hasta : hasta;
  const fechas: FechaKey[] = [];
  if (inicio > fin) return fechas;
  for (let f = inicio; f <= fin; f = sumarDias(f, 1)) {
    if (tocaEn(r, f)) fechas.push(f);
  }
  return fechas;
}

/** Próximo día en que toca desde `desde` (incluido), buscando hasta `horizonteDias`. */
export function proximaOcurrencia(r: Recurrencia, desde: FechaKey, horizonteDias = 400): FechaKey | null {
  const fin = sumarDias(desde, horizonteDias);
  for (let f = desde < r.desde ? r.desde : desde; f <= fin; f = sumarDias(f, 1)) {
    if (r.hasta !== null && f > r.hasta) return null;
    if (tocaEn(r, f)) return f;
  }
  return null;
}
