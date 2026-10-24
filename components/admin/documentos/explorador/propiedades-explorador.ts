/**
 * Las cuentas de «Propiedades» del explorador del Archivo: cuánto pesa una
 * carpeta con todo lo que tiene adentro, cuántos archivos y subcarpetas, y la
 * fecha como se escribe en el negocio («jueves 10/09/2026 · 14:32»).
 *
 * El servidor no publica el tamaño de una carpeta: se suma acá con la lista de
 * archivos y se dice que es la suma de lo que se ve.
 */

import type { DbDocument, DbDocumentFolder } from "@/lib/types/documents";
import { descendientesDe } from "./destino-soltar";

export interface Estadisticas {
  archivos: number;
  carpetas: number;
  bytes: number;
}

/**
 * Todo lo que cuelga de esas carpetas (a cualquier profundidad). `null` en la
 * lista = la raíz del Archivo: todo.
 */
export function estadisticasDe(
  raices: readonly (string | null)[],
  docs: readonly Pick<DbDocument, "folderId" | "size">[],
  hijos: ReadonlyMap<string | null, readonly DbDocumentFolder[]>,
  todasLasCarpetas: number,
): Estadisticas {
  if (raices.includes(null)) {
    return { archivos: docs.length, carpetas: todasLasCarpetas, bytes: docs.reduce((n, d) => n + (d.size ?? 0), 0) };
  }
  const dentro = new Set<string>();
  let carpetas = 0;
  for (const id of raices) {
    if (!id || dentro.has(id)) continue;
    dentro.add(id);
    for (const d of descendientesDe(id, (p) => hijos.get(p) ?? [])) {
      if (!dentro.has(d)) carpetas++;
      dentro.add(d);
    }
  }
  let archivos = 0;
  let bytes = 0;
  for (const d of docs) {
    if (d.folderId && dentro.has(d.folderId)) {
      archivos++;
      bytes += d.size ?? 0;
    }
  }
  return { archivos, carpetas, bytes };
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const dos = (n: number) => String(n).padStart(2, "0");

/** «jueves 10/09/2026 · 14:32» (hora de este equipo). */
export function fechaLarga(iso: string | null | undefined): string {
  if (!iso) return "—";
  const f = new Date(iso);
  if (Number.isNaN(f.getTime())) return "—";
  return `${DIAS[f.getDay()]} ${dos(f.getDate())}/${dos(f.getMonth() + 1)}/${f.getFullYear()} · ${dos(f.getHours())}:${dos(f.getMinutes())}`;
}

export const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;

export function contieneTexto(e: Pick<Estadisticas, "archivos" | "carpetas">): string {
  if (e.archivos === 0 && e.carpetas === 0) return "Vacía";
  return [e.archivos > 0 ? plural(e.archivos, "archivo", "archivos") : null, e.carpetas > 0 ? plural(e.carpetas, "carpeta", "carpetas") : null]
    .filter(Boolean)
    .join(" y ");
}
