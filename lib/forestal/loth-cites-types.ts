/**
 * loth-cites-types — catálogo de permisos CITES del Libro TH (ADR-305).
 *
 * Puro y client-safe (NO importar `lib/db/*`). Gemelo del `citesPermisos[]` de la
 * ficha del CTP: una especie CITES es LEGAL con su permiso de exportación
 * archivado, así que el libro debe poder acreditar el N° de permiso y su vigencia
 * ante OSINFOR — no basta el booleano `cites` suelto.
 *
 * Reusa `estadoVencimiento` de `ctp-ficha-types` (single source de la vigencia).
 */

import { estadoVencimiento, type EstadoVencimiento } from "./ctp-ficha-types";

export { estadoVencimiento };
export type { EstadoVencimiento };

export interface LothCitesPermiso {
  /** Nombre común de la especie que ampara (ej. "Caoba"). */
  especie: string;
  /** N° del permiso CITES de exportación. */
  numero: string;
  /** YYYY-MM-DD de vencimiento (opcional). Un permiso vencido no acredita. */
  vencimiento: string;
}

export interface LothCitesCatalogo {
  permisos: LothCitesPermiso[];
}

export function emptyLothCites(): LothCitesCatalogo {
  return { permisos: [] };
}

/** Normaliza la entrada del editor/API a la forma canónica (descarta filas vacías). */
export function normalizeLothCites(raw: unknown): LothCitesCatalogo {
  const o = (raw ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const arr = Array.isArray(o.permisos) ? o.permisos : [];
  const permisos = arr
    .map((p) => {
      const x = (p ?? {}) as Record<string, unknown>;
      return { especie: s(x.especie), numero: s(x.numero), vencimiento: s(x.vencimiento) };
    })
    .filter((p) => p.especie || p.numero);
  return { permisos };
}

/**
 * ¿Hay un permiso para esta especie CITES? Match laxo por substring (mismo
 * criterio que el panel Cumplimiento del CTP): "Caoba" ↔ "caoba (Swietenia...)".
 */
export function permisoParaEspecie(cat: LothCitesCatalogo, especie: string | null | undefined): LothCitesPermiso | null {
  const e = (especie ?? "").trim().toLowerCase();
  if (!e) return null;
  return (
    cat.permisos.find((p) => {
      const pe = p.especie.toLowerCase();
      return pe.length > 0 && (pe.includes(e) || e.includes(pe));
    }) ?? null
  );
}
