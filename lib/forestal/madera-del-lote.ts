/**
 * La etiqueta de MADERA de un lote de aserrío (Brandon, 2026-10-02): «cuáles
 * tienen madera aserrada y desde cuándo, y cuáles ya no (usada o despachada)».
 *
 * El lote ya sabía qué trozas entraron a la sierra; lo que no decía es en qué
 * terminó lo que salió de ella. Para eso hay que mirar sus corridas con el
 * MISMO criterio que «Productos disponibles»:
 *
 *  · la corrida tiene producción declarada y origen (`whereCorridaEnElPatio`
 *    del servidor, que es el que arma la lista que se pasa acá);
 *  · el saldo sale de `saldosDeCorridas` (ADR-316), la única fuente;
 *  · una corrida marcada «ya se usó» NO está disponible aunque tenga saldo;
 *  · una corrida con paquetes que ya viajan TODOS en guías vivas no tiene nada
 *    en la pila (ADR-444).
 *
 * Si esta etiqueta dijera «con madera» y Productos disponibles no la mostrara,
 * el operador tendría dos verdades. Por eso las reglas viven acá, puras, y el
 * servidor sólo junta los números.
 *
 * PURO y client-safe: sin Prisma, sin fetch.
 */

import { PT_POR_M3 } from "./cubicacion";

/**
 * En qué está la madera del lote.
 *
 * - `sin_produccion`: ninguna corrida declaró producto todavía.
 * - `con_madera`: hay madera en Productos disponibles y nada salió.
 * - `parcial`: queda algo disponible y algo ya salió (usado o despachado).
 * - `usada`: no queda nada disponible; lo que salió, salió SIN guía (uso
 *   interno / merma).
 * - `despachada`: no queda nada disponible; salió con guía de transporte.
 * - `sin_saldo`: no queda nada y tampoco salió: se reprocesó o no había saldo.
 */
export type EstadoMaderaLote =
  | "sin_produccion"
  | "con_madera"
  | "parcial"
  | "usada"
  | "despachada"
  | "sin_saldo";

export interface MaderaDelLote {
  estado: EstadoMaderaLote;
  /** Lo que sigue en Productos disponibles, en m³. */
  m3Disponible: number;
  /** Lo mismo en pie tablar (`PT_POR_M3`). */
  ptDisponible: number;
  /** ISO: la fecha de la PRIMERA corrida con producto (cuándo se aserró). */
  aserradaEl: string | null;
  /** ISO: la última salida — marca «ya se usó» o fecha de la guía de despacho. */
  salioEl: string | null;
  /** GTF de salida vivas, sin repetir, en orden de fecha. */
  guias: string[];
}

/** Una corrida del lote con lo que hace falta para decidir. Cantidades en la unidad de la corrida. */
export interface CorridaParaMadera {
  id: string;
  /** ISO de `entryDate`. */
  fecha: string;
  unidad: string | null;
  /** ISO de la marca «ya se usó»; `null` = no marcada. */
  usadoAt: string | null;
  producido: number;
  despachado: number;
  reprocesado: number;
  /** `saldosDeCorridas().disponible`. */
  disponible: number;
  /** Paquetes vivos de la corrida. */
  paquetes: number;
  /** Paquetes vivos que NO van en una guía viva. */
  paquetesEnPila: number;
  /** Despachos vivos que se llevaron algo de esta corrida. */
  salidas: { fecha: string; gtf: string | null }[];
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Una cantidad en m³ y en pie tablar. `m3` tal cual, `pt` ÷ `PT_POR_M3`; otra
 * unidad (kg, unidad) → 0 en los dos: no se inventa un factor.
 */
export function m3YPtDe(cantidad: number, unidad: string | null): { m3: number; pt: number } {
  const q = Number.isFinite(cantidad) ? cantidad : 0;
  const u = (unidad ?? "m3").trim().toLowerCase().replace("³", "3").replace(/\s+/g, "");
  if (u === "m3") return { m3: q, pt: q * PT_POR_M3 };
  if (u === "pt" || u === "pietablar") return { m3: q / PT_POR_M3, pt: q };
  return { m3: 0, pt: 0 };
}

/**
 * ¿La corrida aparece en Productos disponibles? El mismo corte que
 * `productosDisponibles()`: saldo > 0, sin la marca «ya se usó», y si tiene
 * paquetes, al menos uno que no viaje en una guía viva.
 */
export function enProductosDisponibles(c: CorridaParaMadera): boolean {
  if (c.usadoAt) return false;
  if (!(c.disponible > 0)) return false;
  return c.paquetes === 0 || c.paquetesEnPila > 0;
}

/**
 * La etiqueta del lote a partir de sus corridas CON producción declarada (las
 * que pasan `whereCorridaEnElPatio` con los usados incluidos).
 *
 * Cuando todo salió y salió de las dos formas —una parte con guía y el resto
 * marcado como usado—, manda la que se llevó más m³: es la respuesta a «¿qué
 * pasó con la madera de este lote?».
 */
export function maderaDelLote(corridas: readonly CorridaParaMadera[]): MaderaDelLote {
  if (corridas.length === 0) {
    return { estado: "sin_produccion", m3Disponible: 0, ptDisponible: 0, aserradaEl: null, salioEl: null, guias: [] };
  }
  let m3Disponible = 0;
  let ptDisponible = 0;
  let hayDisponible = false;
  let usadoM3 = 0;
  let despachadoM3 = 0;
  let hayUsado = false;
  let hayDespacho = false;
  let aserradaEl: string | null = null;
  let salioEl: string | null = null;
  const salidas: { fecha: string; gtf: string }[] = [];
  const masTarde = (a: string | null, b: string) => (a == null || b > a ? b : a);

  for (const c of corridas) {
    if (aserradaEl == null || c.fecha < aserradaEl) aserradaEl = c.fecha;
    if (enProductosDisponibles(c)) {
      hayDisponible = true;
      const { m3, pt } = m3YPtDe(c.disponible, c.unidad);
      m3Disponible += m3;
      ptDisponible += pt;
    }
    if (c.usadoAt) {
      hayUsado = true;
      usadoM3 += m3YPtDe(c.disponible, c.unidad).m3;
      salioEl = masTarde(salioEl, c.usadoAt);
    }
    if (c.despachado > 0) {
      hayDespacho = true;
      despachadoM3 += m3YPtDe(c.despachado, c.unidad).m3;
    }
    for (const s of c.salidas) {
      salioEl = masTarde(salioEl, s.fecha);
      const gtf = (s.gtf ?? "").trim();
      if (gtf) salidas.push({ fecha: s.fecha, gtf });
    }
  }

  const salio = hayUsado || hayDespacho;
  const estado: EstadoMaderaLote = hayDisponible
    ? salio
      ? "parcial"
      : "con_madera"
    : !salio
      ? "sin_saldo"
      : hayUsado && (!hayDespacho || usadoM3 > despachadoM3)
        ? "usada"
        : "despachada";

  salidas.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  return {
    estado,
    m3Disponible: r4(m3Disponible),
    ptDisponible: r2(ptDisponible),
    aserradaEl,
    salioEl,
    guias: [...new Set(salidas.map((s) => s.gtf))],
  };
}

/** Cómo se lee la etiqueta en la tarjeta del lote. */
export const ETIQUETA_MADERA: Record<EstadoMaderaLote, string> = {
  sin_produccion: "Sin producción",
  con_madera: "Con madera",
  parcial: "Parte salió",
  usada: "Salió sin guía",
  despachada: "Despachada",
  sin_saldo: "Sin saldo",
};

/** La ayuda de cada etiqueta (tooltip). */
export const AYUDA_MADERA: Record<EstadoMaderaLote, string> = {
  sin_produccion: "Todavía no se declaró qué salió de la sierra con este lote.",
  con_madera: "Su madera aserrada sigue en Productos disponibles.",
  parcial: "Queda madera disponible y otra parte ya salió (con guía o marcada como usada).",
  usada: "Ya no está disponible: salió sin guía · uso interno / merma.",
  despachada: "Ya no está disponible: salió con guía de transporte.",
  sin_saldo: "No queda saldo: se reprocesó o se declaró sin volumen.",
};
