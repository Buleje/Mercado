/**
 * Lógica pura de los avisos flotantes (Brandon 20-10: «notificaciones
 * flotantes por cada uno y un sonido»). Sin React ni navegador: qué avisos
 * son nuevos, cuáles salen flotando, el «y N más» y cuánto dura cada uno.
 * Lo usa `use-avisos-flotantes.ts`.
 */
import type { NotificationItem } from "./useNotificationCenter";

export type AvisoFlotante = Pick<NotificationItem, "id" | "severity" | "title" | "body" | "actionUrl" | "actionLabel" | "readAt" | "createdAt">;

/** Cuántos se piden al subir el total (el «y N más» cuenta el resto). */
export const TOPE_PEDIDO = 5;
/** Más de esto juntos → los 2 más urgentes + un resumen. */
export const MAX_SUELTOS = 3;
export const SUELTOS_CON_RESUMEN = 2;
/** Ids recordados por persona en este navegador: alcanza para varios días de avisos. */
export const TOPE_RECORDADOS = 200;

/** Cuántos pedir cuando el total sin leer pasó de `antes` a `ahora` (0 = no pidas). */
export function cuantosPedir(antes: number | null, ahora: number): number {
  if (antes === null) return 0;
  const subio = ahora - antes;
  return subio > 0 ? Math.min(subio, TOPE_PEDIDO) : 0;
}

/**
 * Reclama en la lista del navegador los ids que todavía nadie mostró: lo
 * reclamado es de ESTA pestaña; la otra pestaña, al leer la lista, ya los ve.
 * Devuelve los suyos y la lista nueva (la más nueva primero, acotada).
 */
export function reclamar(
  guardados: readonly string[],
  candidatos: readonly string[],
  tope: number = TOPE_RECORDADOS,
): { mios: string[]; lista: string[] } {
  const ya = new Set(guardados);
  const mios: string[] = [];
  for (const id of candidatos) {
    if (ya.has(id)) continue;
    ya.add(id);
    mios.push(id);
  }
  const lista = [...mios, ...guardados.filter((id) => !mios.includes(id))].slice(0, tope);
  return { mios, lista };
}

/** Lo que se leyó del navegador: sólo una lista de textos, si no, vacía. */
export function listaGuardada(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((x): x is string => typeof x === "string") : [];
}

const PESO: Record<NotificationItem["severity"], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/** El más urgente primero; a igual urgencia, el más nuevo. */
export function porUrgencia<T extends Pick<AvisoFlotante, "severity" | "createdAt">>(a: T, b: T): number {
  return (PESO[a.severity] ?? 3) - (PESO[b.severity] ?? 3) || Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

export interface Tanda<T> {
  /** Los que salen uno por uno. */
  sueltos: T[];
  /** Cuántos más hay (0 = sin resumen). */
  resto: number;
}

/**
 * Qué sale flotando: hasta 3 nuevos, todos; más de 3, los 2 más urgentes y
 * un «y N más». `total` cuenta también los que no se pidieron (subió 12, se
 * pidieron 5).
 */
export function armarTanda<T extends Pick<AvisoFlotante, "severity" | "createdAt">>(nuevos: readonly T[], total: number = nuevos.length): Tanda<T> {
  const cuantos = Math.max(total, nuevos.length);
  const orden = [...nuevos].sort(porUrgencia);
  if (cuantos <= MAX_SUELTOS) return { sueltos: orden, resto: 0 };
  const sueltos = orden.slice(0, SUELTOS_CON_RESUMEN);
  return { sueltos, resto: cuantos - sueltos.length };
}

/** Cuántos de verdad son nuevos: los que se reclamaron + los que no entraron en el pedido. */
export function totalNuevos(subio: number, pedidos: number, mios: number): number {
  return mios + Math.max(0, subio - pedidos);
}

export type TipoToast = "error" | "warning" | "info";

/** El color y cuánto se queda a la vista: lo urgente espera más. */
export function estiloDe(severity: NotificationItem["severity"]): { tipo: TipoToast; duracion: number } {
  if (severity === "HIGH") return { tipo: "error", duracion: 15_000 };
  if (severity === "MEDIUM") return { tipo: "warning", duracion: 9_000 };
  return { tipo: "info", duracion: 6_000 };
}

/** El cuerpo en una o dos líneas: corta en la palabra y pone «…». */
export function cuerpoCorto(texto: string | null | undefined, max = 110): string {
  const limpio = (texto ?? "").replace(/\s+/g, " ").trim();
  if (limpio.length <= max) return limpio;
  const corte = limpio.slice(0, max - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > max * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** «y 1 aviso más» / «y 4 avisos más». */
export function textoResto(n: number): string {
  return `Y ${n} aviso${n === 1 ? "" : "s"} más sin leer`;
}
