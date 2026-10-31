/**
 * Vencimientos del Archivo, partidos en lo que YA venció y lo que está por
 * vencer. El aviso decía «N por vencer en 30 días» y contaba también lo vencido:
 * lo vencido es otra urgencia (hay que renovarlo ya) y se muestra aparte.
 *
 * Días = `diasHasta` (`Math.ceil`, igual que el `daysUntil` del módulo):
 * `n < 0` ya venció, `n === 0` vence hoy (cuenta como por vencer).
 */

import { diasHasta } from "./aviso-vencimiento";

export interface DocConDias<T> {
  d: T;
  n: number;
}

export interface VencimientosRepartidos<T> {
  /** Ya vencidos, el que lleva más tiempo vencido primero. */
  vencidos: DocConDias<T>[];
  /** Vencen dentro de `dentroDe` días (incluye «vence hoy»), el más cercano primero. */
  porVencer: DocConDias<T>[];
}

/** Reparte los documentos con vencimiento (sin papelera) en vencidos / por vencer. */
export function repartirVencimientos<T extends { expiresAt: string | null; deletedAt?: string | null }>(
  docs: readonly T[],
  dentroDe = 30,
): VencimientosRepartidos<T> {
  const vencidos: DocConDias<T>[] = [];
  const porVencer: DocConDias<T>[] = [];
  for (const d of docs) {
    if (d.deletedAt) continue;
    const n = diasHasta(d.expiresAt);
    if (n === null) continue;
    if (n < 0) vencidos.push({ d, n });
    else if (n <= dentroDe) porVencer.push({ d, n });
  }
  vencidos.sort((a, b) => a.n - b.n);
  porVencer.sort((a, b) => a.n - b.n);
  return { vencidos, porVencer };
}
