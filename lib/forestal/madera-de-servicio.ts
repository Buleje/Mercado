/**
 * madera-de-servicio — la guía cuya madera NO es del aserradero (ADR-437 §1).
 *
 * ## Por qué existe
 *
 * Medido en Blas (26-09): 8 guías / 21 asientos / 135,587 m³ —el 68 % del
 * patio— son madera de WASACO que Blas sólo asierra. Igual pedían costo,
 * contaban «sin costo» en la ficha del permiso y en Rentabilidad, y el precio en
 * tanda las ofrecía. Una guía de servicio **no lleva costo**: no es madera
 * comprada, es madera ajena de paso por la sierra.
 *
 * ## Una sola regla para todos los lectores
 *
 * Hay ~40 lugares que preguntan «¿a esta guía le falta el costo?». Si cada uno
 * lo escribe a mano, alguno se olvida de la marca y la guía de servicio vuelve
 * a aparecer como deuda. Por eso los lectores pasan por:
 *   · `FILTRO_REQUIERE_COSTO` (Prisma `where`) y `FILTRO_REQUIERE_COSTO_SQL`
 *     (SQL crudo), y
 *   · `requiereCosto()` / `esSinCosto()` (en memoria).
 *
 * El booleano es `maderaDeTercero Boolean @default(false)` — no un enum
 * nullable: con `null` cada `where` necesitaría `OR null` y uno de los 40 se lo
 * olvidaría (ADR-437 §1).
 *
 * PURO y client-safe: sin React, sin fetch, sin Prisma.
 */

import { normalizarNombre } from "./directorio-desde-guias";

/** `where` de Prisma: sólo los asientos que SÍ llevan costo (los comprados). */
export const FILTRO_REQUIERE_COSTO = { maderaDeTercero: false } as const;

/**
 * La misma condición para SQL crudo, sobre `"WoodEntry"`. Constante sin datos
 * del usuario: se inserta con `Prisma.raw(FILTRO_REQUIERE_COSTO_SQL)` o dentro
 * de un `Prisma.sql` con `Prisma.raw`. Si la consulta usa alias, anteponerlo a
 * mano (`we."maderaDeTercero" = false`).
 */
export const FILTRO_REQUIERE_COSTO_SQL = `"maderaDeTercero" = false`;

/** Estados de un asiento que no cuentan en el balance (mismo criterio que `setCosto`). */
const ESTADOS_FUERA_DEL_BALANCE = new Set(["rechazado", "anulado"]);

/** Lo mínimo de un asiento para decidir si le falta costo. */
export interface AsientoParaCosto {
  maderaDeTercero?: boolean | null;
  /** Si no se pasa, sólo decide la marca de servicio. */
  status?: string | null;
  costoTotal?: number | string | null | { toString(): string };
}

/**
 * ¿Este asiento tiene que llevar costo?
 *
 * No, si es madera de servicio (no se compró) ni si está anulado o rechazado
 * (no cuenta en el balance). `procesado` SÍ lo lleva: es madera ya aserrada,
 * justo la que más necesita costo para el margen.
 */
export function requiereCosto(e: AsientoParaCosto): boolean {
  if (e.maderaDeTercero === true) return false;
  if (e.status && ESTADOS_FUERA_DEL_BALANCE.has(e.status)) return false;
  return true;
}

/**
 * ¿Es un asiento que DEBERÍA tener costo y no lo tiene? Lo que cuenta «sin
 * costo» en la ficha del permiso, en Ingresos y en Rentabilidad.
 *
 * `0` NO es «sin costo» (es «gratis», un valor cargado); `null` sí.
 */
export function esSinCosto(e: AsientoParaCosto): boolean {
  return requiereCosto(e) && e.costoTotal == null;
}

// ── Sugerencia de dueño desde el permiso ────────────────────────────────────

/** Una guía del mismo permiso, con lo que ya se sabe de su dueño. */
export interface GuiaDelPermisoParaDueno {
  gtfNumber: string;
  maderaDeTercero: boolean;
  duenoParteId: string | null;
  duenoNombre: string | null;
}

/** Una corrida del mismo permiso (ADR-412: `duenoMadera` + `duenoParteId`). */
export interface CorridaDelPermisoParaDueno {
  duenoMadera: string | null;
  duenoParteId: string | null;
  titularNombre: string | null;
}

export interface DuenoSugerido {
  /** `null` cuando sólo se conoce el nombre (la corrida no eligió la ficha). */
  parteId: string | null;
  nombre: string;
  /** De dónde salió, dicho en el idioma del patio: una sugerencia sin origen se copia sin pensarla. */
  motivo: string;
  /** Guías del mismo permiso ya marcadas de servicio con ESTE dueño. */
  guiasDeServicio: number;
  /** Corridas del mismo permiso declaradas «de tercero» con ESTE dueño. */
  corridasDeTercero: number;
}

interface Conteo {
  parteId: string | null;
  nombre: string;
  n: number;
}

/** Agrupa por ficha si la hay; si no, por nombre normalizado. */
function contar<T>(filas: T[], parteId: (f: T) => string | null, nombre: (f: T) => string | null): Conteo[] {
  const mapa = new Map<string, Conteo>();
  for (const f of filas) {
    const id = parteId(f)?.trim() || null;
    const nom = (nombre(f) ?? "").trim();
    if (!id && !nom) continue;
    const clave = id ? `id:${id}` : `nom:${normalizarNombre(nom)}`;
    const c = mapa.get(clave) ?? { parteId: id, nombre: nom, n: 0 };
    c.n += 1;
    if (!c.nombre && nom) c.nombre = nom;
    mapa.set(clave, c);
  }
  // Más frecuente primero; empate por nombre para que la sugerencia no parpadee.
  return [...mapa.values()].sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * ¿De quién sería esta madera, si fuera de servicio? SÓLO sugiere — la marca la
 * confirma una persona (ADR-437 §1: el permiso no lleva columna de dueño).
 *
 * Orden:
 *  1. Otras guías del mismo permiso ya marcadas de servicio: el dueño que más se repite.
 *  2. Corridas del permiso declaradas «de tercero» (ADR-412) — sólo si son
 *     MAYORÍA entre las corridas que declararon dueño: un permiso con 1 corrida
 *     de tercero y 20 propias no es un permiso de servicio.
 *
 * Nunca por RUC (`providerDocument` es el de la ATFFS, ADR-437 §2).
 */
export function duenoSugerido(
  guiasDelPermiso: readonly GuiaDelPermisoParaDueno[],
  corridasDelPermiso: readonly CorridaDelPermisoParaDueno[],
): DuenoSugerido | null {
  const deServicio = guiasDelPermiso.filter((g) => g.maderaDeTercero);
  const porGuias = contar(deServicio, (g) => g.duenoParteId, (g) => g.duenoNombre);
  const deTercero = corridasDelPermiso.filter((c) => c.duenoMadera === "tercero");
  const porCorridas = contar(deTercero, (c) => c.duenoParteId, (c) => c.titularNombre);
  const corridasDeEse = (parteId: string | null, nombre: string) =>
    porCorridas.find((c) =>
      parteId && c.parteId ? c.parteId === parteId : normalizarNombre(c.nombre) === normalizarNombre(nombre),
    )?.n ?? 0;

  const g = porGuias[0];
  if (g && g.nombre) {
    const nC = corridasDeEse(g.parteId, g.nombre);
    return {
      parteId: g.parteId,
      nombre: g.nombre,
      motivo:
        g.n === 1
          ? `Otra guía de este permiso ya es madera de servicio de ${g.nombre}.`
          : `${g.n} guías de este permiso ya son madera de servicio de ${g.nombre}.`,
      guiasDeServicio: g.n,
      corridasDeTercero: nC,
    };
  }

  const declaradas = corridasDelPermiso.filter((c) => c.duenoMadera === "tercero" || c.duenoMadera === "propia").length;
  const c = porCorridas[0];
  if (c && c.nombre && c.n * 2 > declaradas) {
    return {
      parteId: c.parteId,
      nombre: c.nombre,
      motivo:
        c.n === 1
          ? `La única corrida de este permiso que declaró dueño se aserró para ${c.nombre}.`
          : `${c.n} corridas de este permiso se aserraron para ${c.nombre}.`,
      guiasDeServicio: 0,
      corridasDeTercero: c.n,
    };
  }
  return null;
}
