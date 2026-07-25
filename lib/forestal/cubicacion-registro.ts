/**
 * cubicacion-registro — una cubicación GUARDADA: el lote que se midió, con su
 * nombre, su fecha y sus totales congelados. PURO y client-safe (lo usan el
 * componente y la capa de datos).
 *
 * POR QUÉ LOS TOTALES SE CONGELAN: la cubicación guardada es el respaldo de
 * algo que ya pasó (una compra, un despacho, una liquidación). Si mañana sube
 * el precio del pie tablar, el papel que se firmó no cambia — por eso el
 * registro guarda `totales` y `valor` calculados AL GUARDAR, no derivados al
 * leer. Las piezas quedan igual para poder reabrir y seguir trabajando.
 */

import type { PiezaCubicada } from "./cubicacion";
import { cubicarPieza } from "./cubicacion";

export interface CubicacionTotales {
  piezas: number;
  pieTablar: number;
  m3: number;
}

export interface CubicacionRegistro {
  id: string;
  /** Nombre con el que el usuario la va a buscar ("Lote Tornillo · Pérez"). */
  nombre: string;
  /** Fecha del trabajo (date-only AAAA-MM-DD): puede no ser la de guardado. */
  fecha: string;
  /** A quién se le vendió / de quién se compró. Opcional. */
  cliente?: string;
  /** Especie predominante del lote, si se trabajó con una sola. */
  especie?: string;
  notas?: string;
  /** S/ por pie tablar al momento de guardar. */
  precioPt: number;
  /** Valor del lote congelado (pieTablar × precioPt). */
  valor: number;
  totales: CubicacionTotales;
  piezas: PiezaCubicada[];
  /** Línea de PRODUCCIÓN del Libro CTP que se creó desde esta cubicación
   *  ("Enviar al Libro"). Es el hilo que permite, desde un despacho, encontrar
   *  las medidas pieza por pieza que el Libro no guarda. */
  ctpEntryId?: string;
  /** GTF de salida asociada, si ya se conoce (informativo). */
  gtfNumber?: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/** Fecha de hoy en formato date-only, sin arrastrar la hora. */
export const hoyISO = (): string => new Date().toISOString().slice(0, 10);

/** Totales de un conjunto de piezas (los mismos que muestra la tabla). */
export function totalesDe(piezas: PiezaCubicada[]): CubicacionTotales {
  return {
    piezas: piezas.reduce((a, p) => a + (Number(p.cantidad) || 0), 0),
    pieTablar: r2(piezas.reduce((a, p) => a + (Number(p.pieTablar) || 0), 0)),
    m3: r4(piezas.reduce((a, p) => a + (Number(p.m3) || 0), 0)),
  };
}

/**
 * Deja una pieza en forma canónica y RECALCULA su cubicación: lo que llega del
 * cliente no se cree a ciegas (podría venir con un pie tablar inventado).
 */
function normalizarPieza(raw: Record<string, unknown>, i: number): PiezaCubicada {
  const num = (v: unknown, def = 0) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  const unidad = (v: unknown, def: PiezaCubicada["uEspesor"]) =>
    v === "pulg" || v === "cm" || v === "pies" || v === "m" ? v : def;
  const base = {
    cantidad: Math.max(1, Math.round(num(raw.cantidad, 1))),
    espesor: num(raw.espesor, 1),
    ancho: num(raw.ancho, 1),
    largo: num(raw.largo, 1),
    uEspesor: unidad(raw.uEspesor, "pulg"),
    uAncho: unidad(raw.uAncho, "pulg"),
    uLargo: unidad(raw.uLargo, "pies"),
  };
  const { pieTablar, m3 } = cubicarPieza(base);
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : `p-${i}`,
    ...base,
    especie: typeof raw.especie === "string" && raw.especie ? raw.especie.slice(0, 60) : undefined,
    pieTablar,
    m3,
  };
}

/**
 * Arma el registro completo a partir de lo que hay en pantalla. Es la única
 * vía de creación: así los totales guardados SIEMPRE salen de las piezas.
 */
export function construirRegistro(input: {
  id?: string;
  nombre: string;
  fecha?: string;
  cliente?: string;
  especie?: string;
  notas?: string;
  precioPt?: number;
  piezas: Record<string, unknown>[];
  ctpEntryId?: string;
  gtfNumber?: string;
  createdAt?: string;
  createdBy?: string;
}): CubicacionRegistro {
  const piezas = input.piezas.map(normalizarPieza);
  const totales = totalesDe(piezas);
  const precioPt = Number.isFinite(Number(input.precioPt)) && Number(input.precioPt) > 0 ? r2(Number(input.precioPt)) : 0;
  const ahora = new Date().toISOString();
  return {
    id: input.id ?? `cub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    nombre: (input.nombre || "Cubicación sin nombre").trim().slice(0, 120),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(input.fecha ?? "") ? input.fecha! : hoyISO(),
    cliente: input.cliente?.trim().slice(0, 120) || undefined,
    especie: input.especie?.trim().slice(0, 60) || undefined,
    notas: input.notas?.trim().slice(0, 600) || undefined,
    precioPt,
    valor: r2(totales.pieTablar * precioPt),
    totales,
    piezas,
    ctpEntryId: input.ctpEntryId?.trim().slice(0, 60) || undefined,
    gtfNumber: input.gtfNumber?.trim().slice(0, 60) || undefined,
    createdAt: input.createdAt ?? ahora,
    updatedAt: ahora,
    createdBy: input.createdBy,
  };
}

/** Nombre sugerido cuando el usuario no escribe uno: fecha + especie + piezas. */
export function nombreSugerido(especie: string | undefined, totales: CubicacionTotales): string {
  const fecha = new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
  return `${especie ? `${especie} · ` : ""}${totales.piezas} pzas · ${fecha}`;
}

/** Filtra el historial por nombre, cliente, especie o fecha. */
export function filtrarCubicaciones(lista: CubicacionRegistro[], termino: string): CubicacionRegistro[] {
  const t = termino.trim().toLowerCase();
  if (!t) return lista;
  return lista.filter((c) =>
    [c.nombre, c.cliente, c.especie, c.fecha, c.notas].some((campo) => (campo ?? "").toLowerCase().includes(t)),
  );
}
