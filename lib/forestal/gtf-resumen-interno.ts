/**
 * gtf-resumen-interno — el «Resumen interno» de una GTF del Libro TH (Brandon
 * 08-10): una hoja propia, distinta de la guía, con cuatro preguntas que el
 * titular se hace de cada guía:
 *
 *   R1 · ¿Qué salió? Por especie y por árbol: trozas, m³ y el rango (mínimo,
 *        promedio, máximo) del Ø y del largo.
 *   R2 · ¿Cuadra? Lo que DECLARA la guía (la ficha de SERFOR si se importó; si
 *        no, lo que registró el libro al emitirla) contra la SUMA de sus trozas
 *        y contra el LIBRO (sus líneas de Despacho, medidas con su Trozado).
 *   R3 · ¿Dónde está cada troza hoy? Despachada (libro TH) → recibida en el
 *        CTP → aserrada, con la fecha de cada paso.
 *   R4 · ¿Cuánto le queda al permiso? Saldo antes y después de esta guía:
 *        autorizado − lo movilizado por las guías anteriores (y por ésta).
 *
 * No recalcula nada que la API publique: los m³ de cada despacho son los de su
 * línea de Trozado (`trozado.volumeM3`, la misma que suma el saldo SERFOR) y el
 * autorizado es el del balance del plan. Las tolerancias van en la unidad del
 * negocio: 0,001 m³ (la guía declara con tres decimales).
 *
 * PURO: sin React, sin fetch, sin DOM, sin `Date.now`.
 */

import { arbolDeCodificacion } from "./loth-importar-guia";
import { claveNumeroGtf, mismoNumeroGtf } from "./gtf-talonario";

/** Diferencia que se dice: la guía declara m³ con tres decimales. */
export const TOLERANCIA_RESUMEN_M3 = 0.001;

// ─── Lo que entra ────────────────────────────────────────────────────────────

/** Una troza de la lista de la guía (`ForestGtf.items`). */
export interface PiezaDelResumen {
  /** Código único del libro (T3). */
  codigo: string;
  /** El impreso en la guía; si no lo trae, es el mismo que el único (ADR-474). */
  codigoGuia: string | null;
  arbol: string | null;
  especie: string | null;
  d1M: number | null;
  d2M: number | null;
  largoM: number | null;
  m3: number | null;
}

/** Una línea de Despacho del Libro TH, con la medida de su Trozado. */
export interface LineaDelResumen {
  gtfNumber: string | null;
  /** `YYYY-MM-DD`. */
  dia: string;
  trozaCode: string | null;
  /** m³ de la troza (su Trozado) o del producto en m³; `null` sin medida. */
  m3: number | null;
  /** Árbol, leído de su Trozado. */
  arbol: string | null;
  /** Id de la línea de Trozado (con él se pregunta al Libro CTP). */
  trozadoId: string | null;
  /** Línea de Despacho de productos: suma sus m³, pero no es una troza (R2, R3). */
  esProducto?: boolean;
}

/** Lo que el Libro CTP sabe de la troza de un Trozado (`/loth/aserradero`). */
export interface PasoCtp {
  /** Día en que bajó del camión; `null` = no llegó todavía. */
  recibida: string | null;
  /** Día de la corrida viva que la aserró. */
  aserrada: string | null;
  /** Día del despacho vivo: salió entera sin aserrar. */
  salioEntera: string | null;
}

export interface EntradaResumenInterno {
  guia: {
    gtfNumber: string;
    /** `YYYY-MM-DD` o `null`. */
    gtfDate: string | null;
    /** m³ y trozas que DECLARA la guía; `null` = no lo dice. */
    declaradoM3: number | null;
    declaradoTrozas: number | null;
    /** De dónde sale lo declarado: la ficha publicada por SERFOR o el registro de la guía. */
    fuenteDeclarado: "serfor" | "registro";
  };
  piezas: readonly PiezaDelResumen[];
  /** Las líneas de Despacho de ESTA guía (vivas). */
  lineasDeLaGuia: readonly LineaDelResumen[];
  /** Todas las líneas de Despacho vivas del permiso; `null` = sin permiso o no se pudo leer. */
  lineasDelPermiso: readonly LineaDelResumen[] | null;
  /** Σ autorizado del plan; `null` = sin permiso o no se pudo leer. */
  autorizadoM3: number | null;
  /** Por id de Trozado; `null` = el negocio no lleva el Libro CTP o no se pudo leer. */
  ctp: ReadonlyMap<string, readonly PasoCtp[]> | null;
}

// ─── Lo que sale ─────────────────────────────────────────────────────────────

export interface Rango {
  min: number;
  prom: number;
  max: number;
}

export interface FilaR1 {
  clave: string;
  trozas: number;
  m3: number;
  /** Ø promedio de cada troza ((D1 + D2) ÷ 2), en METROS. */
  diametro: Rango | null;
  largo: Rango | null;
}

export interface CuadreR2 {
  declarado: { m3: number | null; trozas: number | null; fuente: "serfor" | "registro" };
  suma: { m3: number; trozas: number };
  libro: { m3: number; trozas: number; sinMedida: number };
  /** suma − declarado; `null` si la guía no declara. */
  difSumaM3: number | null;
  /** libro − declarado; `null` si la guía no declara. */
  difLibroM3: number | null;
  difSumaTrozas: number | null;
  difLibroTrozas: number | null;
  cuadra: boolean;
}

export type EstadoTrozaHoy = "aserrada" | "salio_entera" | "recibida" | "despachada" | "sin_despacho";

export interface FilaR3 {
  n: number;
  codigoGuia: string;
  codigo: string;
  arbol: string | null;
  especie: string | null;
  d1M: number | null;
  d2M: number | null;
  largoM: number | null;
  m3: number | null;
  estado: EstadoTrozaHoy;
  despachada: string | null;
  recibida: string | null;
  aserrada: string | null;
  salioEntera: string | null;
}

export interface ResumenR3 {
  filas: FilaR3[];
  despachadas: number;
  recibidas: number;
  aserradas: number;
  /** `false` = no se sabe qué pasó en el CTP (sin Libro CTP o no se pudo leer). */
  conCtp: boolean;
}

export interface SaldoR4 {
  autorizado: number;
  antes: number;
  estaGuia: number;
  despues: number;
  saldoAntes: number;
  saldoDespues: number;
  /** La guía no tiene líneas en el libro: «esta guía» sale de la suma de sus trozas. */
  estaDesdeLaGuia: boolean;
  /** Guías posteriores a ésta (lo movilizado después no entra). */
  posteriores: number;
}

export interface ResumenInterno {
  porEspecie: FilaR1[];
  porArbol: FilaR1[];
  totalR1: FilaR1;
  cuadre: CuadreR2;
  donde: ResumenR3;
  /** `null` = sin permiso o sin autorizado cargado: no hay saldo que decir. */
  saldo: SaldoR4 | null;
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

const r4 = (v: number): number => Math.round(v * 10000) / 10000;
const txt = (v: string | null | undefined): string => (v ?? "").trim();

function rango(valores: readonly number[]): Rango | null {
  if (valores.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let suma = 0;
  for (const v of valores) {
    if (v < min) min = v;
    if (v > max) max = v;
    suma += v;
  }
  return { min, prom: suma / valores.length, max };
}

/** Ø de una troza: el promedio de sus dos puntas; con una sola, ésa. */
export function diametroDe(p: Pick<PiezaDelResumen, "d1M" | "d2M">): number | null {
  const ds = [p.d1M, p.d2M].filter((d): d is number => d != null && d > 0);
  if (ds.length === 0) return null;
  return ds.reduce((a, b) => a + b, 0) / ds.length;
}

function filaR1(clave: string, piezas: readonly PiezaDelResumen[]): FilaR1 {
  return {
    clave,
    trozas: piezas.length,
    m3: r4(piezas.reduce((a, p) => a + (p.m3 ?? 0), 0)),
    diametro: rango(piezas.map(diametroDe).filter((d): d is number => d != null)),
    largo: rango(piezas.map((p) => p.largoM).filter((l): l is number => l != null && l > 0)),
  };
}

function agrupar(piezas: readonly PiezaDelResumen[], claveDe: (p: PiezaDelResumen) => string): FilaR1[] {
  const grupos = new Map<string, PiezaDelResumen[]>();
  for (const p of piezas) {
    const k = claveDe(p);
    const xs = grupos.get(k) ?? [];
    xs.push(p);
    grupos.set(k, xs);
  }
  return [...grupos].map(([k, xs]) => filaR1(k, xs));
}

/** Orden natural de los árboles: «2» antes que «10». */
const porNombre = (a: FilaR1, b: FilaR1) => a.clave.localeCompare(b.clave, "es", { numeric: true });

// ─── R1 ──────────────────────────────────────────────────────────────────────

/**
 * El árbol de una troza: el que trae la guía; si no, el de su Trozado en el
 * libro; si tampoco, el que dice su código («12A» → «12»).
 */
export function arbolDeLaPieza(p: PiezaDelResumen, arbolDelLibro: ReadonlyMap<string, string>): string {
  return txt(p.arbol) || arbolDelLibro.get(txt(p.codigo)) || arbolDeCodificacion(p.codigo) || "Sin árbol";
}

export function r1(
  piezas: readonly PiezaDelResumen[],
  arbolDelLibro: ReadonlyMap<string, string> = new Map(),
): { porEspecie: FilaR1[]; porArbol: FilaR1[]; total: FilaR1 } {
  return {
    porEspecie: agrupar(piezas, (p) => txt(p.especie).toUpperCase() || "SIN ESPECIE").sort((a, b) => b.m3 - a.m3 || porNombre(a, b)),
    porArbol: agrupar(piezas, (p) => arbolDeLaPieza(p, arbolDelLibro)).sort(porNombre),
    total: filaR1("Total", piezas),
  };
}

// ─── R2 ──────────────────────────────────────────────────────────────────────

export function r2(e: Pick<EntradaResumenInterno, "guia" | "piezas" | "lineasDeLaGuia">): CuadreR2 {
  const suma = { m3: r4(e.piezas.reduce((a, p) => a + (p.m3 ?? 0), 0)), trozas: e.piezas.length };
  const conMedida = e.lineasDeLaGuia.filter((l) => l.m3 != null);
  const libro = {
    m3: r4(conMedida.reduce((a, l) => a + (l.m3 ?? 0), 0)),
    /* Trozas = las líneas de Despacho de trozas; un producto suma m³, no piezas. */
    trozas: e.lineasDeLaGuia.filter((l) => !l.esProducto).length,
    sinMedida: e.lineasDeLaGuia.length - conMedida.length,
  };
  const dm3 = e.guia.declaradoM3;
  const dtr = e.guia.declaradoTrozas;
  const difSumaM3 = dm3 == null ? null : r4(suma.m3 - dm3);
  const difLibroM3 = dm3 == null ? null : r4(libro.m3 - dm3);
  const difSumaTrozas = dtr == null ? null : suma.trozas - dtr;
  const difLibroTrozas = dtr == null ? null : libro.trozas - dtr;
  const fuera = (d: number | null) => d != null && Math.abs(d) >= TOLERANCIA_RESUMEN_M3;
  const cuadra =
    !fuera(difSumaM3) &&
    !fuera(difLibroM3) &&
    !difSumaTrozas &&
    !difLibroTrozas &&
    libro.sinMedida === 0 &&
    /* Sin declarado, cuadra si la suma y el libro dicen lo mismo. */
    (dm3 != null || Math.abs(suma.m3 - libro.m3) < TOLERANCIA_RESUMEN_M3);
  return { declarado: { m3: dm3, trozas: dtr, fuente: e.guia.fuenteDeclarado }, suma, libro, difSumaM3, difLibroM3, difSumaTrozas, difLibroTrozas, cuadra };
}

// ─── R3 ──────────────────────────────────────────────────────────────────────

const primero = (xs: readonly (string | null)[]): string | null =>
  xs.filter((x): x is string => Boolean(x)).sort()[0] ?? null;

export function r3(e: Pick<EntradaResumenInterno, "piezas" | "lineasDeLaGuia" | "ctp">): ResumenR3 {
  const lineaDe = new Map<string, LineaDelResumen>();
  for (const l of e.lineasDeLaGuia) {
    const k = txt(l.trozaCode);
    if (k && !l.esProducto && !lineaDe.has(k)) lineaDe.set(k, l);
  }
  const filas = e.piezas.map((p, i): FilaR3 => {
    const linea = lineaDe.get(txt(p.codigo)) ?? null;
    const pasos = linea?.trozadoId && e.ctp ? e.ctp.get(linea.trozadoId) ?? [] : [];
    /* Una troza retrozada en el CTP son varias piezas: cuenta la primera fecha de cada paso. */
    const recibida = primero(pasos.map((x) => x.recibida));
    const aserrada = primero(pasos.map((x) => x.aserrada));
    const salioEntera = primero(pasos.map((x) => x.salioEntera));
    const estado: EstadoTrozaHoy = aserrada
      ? "aserrada"
      : salioEntera
        ? "salio_entera"
        : recibida
          ? "recibida"
          : linea
            ? "despachada"
            : "sin_despacho";
    return {
      n: i + 1,
      codigoGuia: txt(p.codigoGuia) || txt(p.codigo),
      codigo: txt(p.codigo),
      arbol: txt(p.arbol) || txt(linea?.arbol) || null,
      especie: txt(p.especie) || null,
      d1M: p.d1M,
      d2M: p.d2M,
      largoM: p.largoM,
      m3: p.m3,
      estado,
      despachada: linea?.dia ?? null,
      recibida,
      aserrada,
      salioEntera,
    };
  });
  return {
    filas,
    despachadas: filas.filter((f) => f.despachada).length,
    recibidas: filas.filter((f) => f.recibida).length,
    aserradas: filas.filter((f) => f.estado === "aserrada").length,
    conCtp: e.ctp !== null,
  };
}

// ─── R4 ──────────────────────────────────────────────────────────────────────

/**
 * ¿La línea salió ANTES que esta guía? Por día; el mismo día, por N° de guía
 * (el talonario es correlativo). Una línea sin N° del mismo día cuenta antes:
 * no hay cómo ordenarla y el saldo «antes» no puede inventarse holgura.
 */
function salioAntes(l: LineaDelResumen, corte: string, numero: string): boolean {
  if (l.dia < corte) return true;
  if (l.dia > corte) return false;
  const kl = claveNumeroGtf(l.gtfNumber);
  const kg = claveNumeroGtf(numero);
  if (!kl || !kg) return true;
  return kl.localeCompare(kg, "es", { numeric: true }) < 0;
}

export function r4Saldo(
  e: Pick<EntradaResumenInterno, "guia" | "piezas" | "lineasDeLaGuia" | "lineasDelPermiso" | "autorizadoM3">,
): SaldoR4 | null {
  if (e.lineasDelPermiso == null || e.autorizadoM3 == null || e.autorizadoM3 <= 0) return null;
  const numero = e.guia.gtfNumber;
  const propias = e.lineasDeLaGuia;
  const corte = primero(propias.map((l) => l.dia)) ?? e.guia.gtfDate ?? "9999-12-31";
  const ajenas = e.lineasDelPermiso.filter((l) => !mismoNumeroGtf(l.gtfNumber, numero));
  const antes = r4(ajenas.filter((l) => salioAntes(l, corte, numero)).reduce((a, l) => a + (l.m3 ?? 0), 0));
  const delLibro = r4(propias.reduce((a, l) => a + (l.m3 ?? 0), 0));
  const estaDesdeLaGuia = propias.length === 0;
  const estaGuia = estaDesdeLaGuia ? r4(e.piezas.reduce((a, p) => a + (p.m3 ?? 0), 0)) : delLibro;
  const despues = r4(antes + estaGuia);
  const posteriores = new Set(
    ajenas.filter((l) => !salioAntes(l, corte, numero)).map((l) => claveNumeroGtf(l.gtfNumber) ?? `sin-${l.dia}`),
  ).size;
  return {
    autorizado: r4(e.autorizadoM3),
    antes,
    estaGuia,
    despues,
    saldoAntes: r4(e.autorizadoM3 - antes),
    saldoDespues: r4(e.autorizadoM3 - despues),
    estaDesdeLaGuia,
    posteriores,
  };
}

// ─── Todo junto ──────────────────────────────────────────────────────────────

export function resumenInterno(e: EntradaResumenInterno): ResumenInterno {
  const arbolDelLibro = new Map<string, string>();
  for (const l of e.lineasDeLaGuia) {
    const k = txt(l.trozaCode);
    if (k && txt(l.arbol)) arbolDelLibro.set(k, txt(l.arbol));
  }
  const uno = r1(e.piezas, arbolDelLibro);
  return {
    porEspecie: uno.porEspecie,
    porArbol: uno.porArbol,
    totalR1: uno.total,
    cuadre: r2(e),
    donde: r3(e),
    saldo: r4Saldo(e),
  };
}
