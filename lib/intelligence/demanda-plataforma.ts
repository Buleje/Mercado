/**
 * lib/intelligence/demanda-plataforma.ts
 *
 * Parte PURA de «Inteligencia de demanda» (superadmin): agrupa y normaliza las
 * filas que trae `DemandaPlataformaDB` antes de entregarlas a `buildDemandReport`.
 * Sin Prisma ni red: se prueba con filas armadas a mano.
 *
 * Dos mundos:
 *  - Tienda: unidades por categoría (pedidos). Ventana de 30 días; si la
 *    plataforma vendió poco en 30 días se mira 90 (medido 04-11: 1 unidad en 30
 *    días y 58 en 90 → el reporte de 30 días salía vacío).
 *  - Madera: m³ por especie de los aserraderos (producción y despacho del libro
 *    CTP + trozas que ingresaron por GTF). Ventana de 90 días contra los 90
 *    anteriores, porque el aserradero no vende por pedidos de tienda.
 */
import type { DemandInput } from "./demand-signals";

// ── Nombres ────────────────────────────────────────────────────────────────

const SIN_ESPECIE = "Sin especie";

function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** «TORNILLO», «tornillo » y «Tornillo» (o «Panadería» y «panaderia») son lo mismo. */
export function claveDeNombre(raw: string | null | undefined): string {
  const limpio = (raw ?? "").trim().replace(/\s+/g, " ");
  return limpio ? sinTildes(limpio).toLowerCase() : "";
}

/** Nombre para mostrar: primera letra en mayúscula, resto en minúscula. */
export function nombreVisible(raw: string | null | undefined, vacio = SIN_ESPECIE): string {
  const limpio = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!limpio) return vacio;
  const minus = limpio.toLowerCase();
  return minus.charAt(0).toUpperCase() + minus.slice(1);
}

// ── Tienda ─────────────────────────────────────────────────────────────────

/** Unidades de un negocio y categoría en las 4 ventanas que mira la consulta. */
export interface FilaDemandaTienda {
  tenantId: string;
  category: string;
  /** Últimos 30 días. */
  u30: number;
  /** Los 30 días anteriores a esos. */
  p30: number;
  /** Últimos 90 días. */
  u90: number;
  /** Los 90 días anteriores a esos. */
  p90: number;
}

export interface VentanaDemanda {
  days: 30 | 90;
  label: string;
}

/** Con menos unidades que esto en 30 días, la tendencia es ruido: se mira 90. */
export const MIN_UNIDADES_VENTANA_CORTA = 20;

export function elegirVentana(filas: readonly FilaDemandaTienda[]): VentanaDemanda {
  const u30 = filas.reduce((s, f) => s + f.u30, 0);
  return u30 >= MIN_UNIDADES_VENTANA_CORTA
    ? { days: 30, label: "Últimos 30 días" }
    : { days: 90, label: "Últimos 90 días" };
}

function enVentana(f: FilaDemandaTienda, v: VentanaDemanda): { units: number; prev: number } {
  return v.days === 30 ? { units: f.u30, prev: f.p30 } : { units: f.u90, prev: f.p90 };
}

/** Unidades por categoría (todos los negocios juntos), ventana actual contra la anterior. */
export function categoriasDeFilas(
  filas: readonly FilaDemandaTienda[],
  v: VentanaDemanda,
): DemandInput["categories"] {
  const porCategoria = new Map<string, { category: string; units: number; prevUnits: number }>();
  for (const f of filas) {
    const clave = claveDeNombre(f.category);
    if (!clave) continue;
    const { units, prev } = enVentana(f, v);
    const acc = porCategoria.get(clave) ?? { category: nombreVisible(f.category), units: 0, prevUnits: 0 };
    acc.units += units;
    acc.prevUnits += prev;
    porCategoria.set(clave, acc);
  }
  return Array.from(porCategoria.values()).filter((a) => a.units > 0 || a.prevUnits > 0);
}

/**
 * Unidades por zona: cada negocio cuenta en la zona de su (primera) tienda
 * publicada. Una zona aparece solo si vendió algo en la ventana.
 */
export function zonasDeFilas(
  filas: readonly FilaDemandaTienda[],
  v: VentanaDemanda,
  zonaDeNegocio: ReadonlyMap<string, string>,
  quiebresPorNegocio: ReadonlyMap<string, number>,
): DemandInput["zones"] {
  const porZona = new Map<string, { units: number; porCategoria: Map<string, number> }>();
  for (const f of filas) {
    const zona = zonaDeNegocio.get(f.tenantId);
    if (!zona) continue;
    const { units } = enVentana(f, v);
    if (units <= 0) continue;
    const acc = porZona.get(zona) ?? { units: 0, porCategoria: new Map<string, number>() };
    acc.units += units;
    const categoria = nombreVisible(f.category, "");
    if (categoria) acc.porCategoria.set(categoria, (acc.porCategoria.get(categoria) ?? 0) + units);
    porZona.set(zona, acc);
  }

  const quiebresPorZona = new Map<string, number>();
  for (const [tenantId, zona] of zonaDeNegocio) {
    quiebresPorZona.set(zona, (quiebresPorZona.get(zona) ?? 0) + (quiebresPorNegocio.get(tenantId) ?? 0));
  }

  return Array.from(porZona.entries()).map(([zone, acc]) => ({
    zone,
    units: acc.units,
    categoryUnits: Array.from(acc.porCategoria.entries()).map(([category, units]) => ({ category, units })),
    stockouts: quiebresPorZona.get(zone) ?? 0,
  }));
}

// ── Madera ─────────────────────────────────────────────────────────────────

export type FlujoMadera = "produccion" | "despacho" | "ingreso";

/** Lo que una fuente del aserradero movió de una especie en la ventana y en la anterior. */
export interface FilaMadera {
  tenantId: string;
  flujo: FlujoMadera;
  especie: string | null;
  /** Unidad con que se anotó (`m3`, `pt`, `kg`…); las trozas de guía ya vienen en m3. */
  unidad: string | null;
  actual: number;
  previo: number;
}

export interface MaderaEspecie {
  species: string;
  /** m³ movidos en la ventana (producción + despacho + ingreso de trozas). */
  m3: number;
  prevM3: number;
  trendPct: number;
  produccionM3: number;
  despachoM3: number;
  ingresoM3: number;
  /** Cuántos aserraderos la movieron. */
  negocios: number;
}

export interface MaderaReporte {
  days: number;
  label: string;
  totalM3: number;
  negocios: number;
  species: MaderaEspecie[];
}

/** Pies tablares por m³ de madera aserrada (ADR-531: m³ = PT ÷ 424). */
const PT_POR_M3 = 424;

/** Cantidad del libro a m³; lo que no es volumen (kg, unidades, sin unidad) no suma. */
export function m3De(cantidad: number, unidad: string | null): number {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return 0;
  const u = (unidad ?? "").trim().toLowerCase();
  if (u === "m3" || u === "m³") return cantidad;
  if (u === "pt") return cantidad / PT_POR_M3;
  return 0;
}

function variacionPct(actual: number, previo: number): number {
  if (previo <= 0) return actual > 0 ? 100 : 0;
  return Math.round(((actual - previo) / previo) * 100);
}

const redondear3 = (n: number): number => Math.round(n * 1000) / 1000;

export function armarMadera(filas: readonly FilaMadera[], days: number, label: string): MaderaReporte {
  type Acc = {
    species: string;
    m3: number;
    prev: number;
    porFlujo: Record<FlujoMadera, number>;
    negocios: Set<string>;
  };
  const porEspecie = new Map<string, Acc>();
  const negociosTotal = new Set<string>();

  for (const f of filas) {
    const actual = m3De(f.actual, f.unidad);
    const previo = m3De(f.previo, f.unidad);
    if (actual <= 0 && previo <= 0) continue;
    const clave = claveDeNombre(f.especie) || SIN_ESPECIE;
    const acc = porEspecie.get(clave) ?? {
      species: nombreVisible(f.especie),
      m3: 0,
      prev: 0,
      porFlujo: { produccion: 0, despacho: 0, ingreso: 0 },
      negocios: new Set<string>(),
    };
    acc.m3 += actual;
    acc.prev += previo;
    acc.porFlujo[f.flujo] += actual;
    if (actual > 0) {
      acc.negocios.add(f.tenantId);
      negociosTotal.add(f.tenantId);
    }
    porEspecie.set(clave, acc);
  }

  const species = Array.from(porEspecie.values())
    .map((a): MaderaEspecie => ({
      species: a.species,
      m3: redondear3(a.m3),
      prevM3: redondear3(a.prev),
      trendPct: variacionPct(a.m3, a.prev),
      produccionM3: redondear3(a.porFlujo.produccion),
      despachoM3: redondear3(a.porFlujo.despacho),
      ingresoM3: redondear3(a.porFlujo.ingreso),
      negocios: a.negocios.size,
    }))
    .filter((e) => e.m3 > 0 || e.prevM3 > 0)
    .sort((a, b) => b.m3 - a.m3 || a.species.localeCompare(b.species, "es"));

  return {
    days,
    label,
    totalM3: redondear3(species.reduce((s, e) => s + e.m3, 0)),
    negocios: negociosTotal.size,
    species,
  };
}
