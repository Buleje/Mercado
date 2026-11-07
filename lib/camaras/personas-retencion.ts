/**
 * Retención de las fotos del detector de personas (Brandon 2026-10-08).
 *
 * Con gente todo el día son ~1.200 fotos por día en el Drive. Pasados N días
 * van a la PAPELERA (el vaciado de la papelera las purga después, con su
 * propio plazo). N lo elige cada negocio; sin configurar, 30.
 *
 * Funciones puras (client-safe): el cron y la pantalla de ajustes comparten
 * el mismo límite y la misma cuenta de «qué ya venció».
 *
 * «Más de N días» se cuenta en DÍAS DE LIMA, no en horas corridas: con N = 30
 * y hoy 8 de octubre, se conservan las fotos desde el 8 de septiembre a las
 * 00:00 de Lima; las del 7 de septiembre ya vencieron — aunque se hayan tomado
 * a las 23:59. Así una carpeta de día se va entera, nunca a medias.
 */

import { rangoDiaLima } from "./personas-galeria";
import { limaDateKey } from "@/lib/utils";

export const DIAS_RETENCION_PERSONAS_DEFECTO = 30;
export const DIAS_RETENCION_PERSONAS_MIN = 1;
/** Tope 60 días (Ley 29733, directiva de videovigilancia; Brandon 08-10). */
export const DIAS_RETENCION_PERSONAS_MAX = 60;

/** Tag con el que el detector marca sus fotos en el Drive. */
export const TAG_FOTO_PERSONA = "personas";

/** Un número de días válido (entero, dentro del rango) o `null`. */
export function diasRetencionValidos(valor: unknown): number | null {
  const n = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : valor;
  if (typeof n !== "number" || !Number.isInteger(n)) return null;
  if (n < DIAS_RETENCION_PERSONAS_MIN || n > DIAS_RETENCION_PERSONAS_MAX) return null;
  return n;
}

/**
 * Lo guardado (`{ dias }`) → días a usar; cualquier cosa rara = el default.
 * Un negocio que guardó más del tope (antes era 365) queda en el tope, no en
 * el default: bajar el tope no debe borrar fotos que el negocio quería tener.
 */
export function diasRetencionDe(guardado: unknown): number {
  const crudo = guardado && typeof guardado === "object" && !Array.isArray(guardado) ? (guardado as { dias?: unknown }).dias : null;
  if (typeof crudo === "number" && Number.isInteger(crudo) && crudo > DIAS_RETENCION_PERSONAS_MAX) return DIAS_RETENCION_PERSONAS_MAX;
  return diasRetencionValidos(crudo) ?? DIAS_RETENCION_PERSONAS_DEFECTO;
}

/** Instante desde el cual las fotos se conservan: 00:00 de Lima de hoy − `dias`. */
export function corteRetencionPersonas(ahora: Date, dias: number): Date {
  const hoy = rangoDiaLima(limaDateKey(ahora)).desde;
  const corte = new Date(hoy);
  corte.setUTCDate(corte.getUTCDate() - dias);
  return corte;
}

/** ¿Esta foto ya venció? (`uploadedAt` estrictamente antes del corte.) */
export function fotoVencida(subidaEn: Date | string, ahora: Date, dias: number): boolean {
  return new Date(subidaEn).getTime() < corteRetencionPersonas(ahora, dias).getTime();
}

/** De una lista de fotos, las que ya vencieron. */
export function fotosVencidas<T extends { uploadedAt: Date | string }>(fotos: readonly T[], ahora: Date, dias: number): T[] {
  const corte = corteRetencionPersonas(ahora, dias).getTime();
  return fotos.filter((f) => new Date(f.uploadedAt).getTime() < corte);
}
