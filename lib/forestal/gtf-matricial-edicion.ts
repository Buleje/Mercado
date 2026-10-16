/**
 * gtf-matricial-edicion — las herramientas del diseñador del talonario sobre
 * VARIOS campos a la vez (Brandon 15-10: «opciones para alinearlas en una fila
 * completa, también en columnas, y otras funciones que se pueden aplicar»):
 * alinear, repartir parejo, igualar, imán a la cuadrícula, elegir la fila o la
 * columna, elegir con un recuadro, guías al arrastrar, deshacer/rehacer y la
 * lupa. PURO: la pantalla sólo llama y dibuja.
 *
 * Un «elemento» es un campo suelto o una COLUMNA de la tabla. Las columnas
 * comparten la Y de la tabla: mover una en Y corre la tabla entera.
 *
 * La caja de cada elemento mide su ancho máximo × un renglón (letra × 1,15):
 * es lo que ocupa en el papel (`gtf-matricial-print`).
 */

import {
  acotarPos,
  POS_MAX_MM,
  POS_MIN_MM,
  type CatalogoFormato,
  type DisposicionHoja,
} from "./gtf-matricial-disposicion";

export type TipoElemento = "campo" | "columna";
export interface Elemento {
  tipo: TipoElemento;
  id: string;
}
export interface CajaMm {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}
/** Lo que una herramienta cambia de cada elemento, por `claveElemento`. */
export type Movimientos = Record<string, { x?: number; y?: number }>;

export const claveElemento = (e: Elemento): string => `${e.tipo}:${e.id}`;
export const elementoDeClave = (k: string): Elemento => {
  const [tipo, ...resto] = k.split(":");
  return { tipo: tipo === "columna" ? "columna" : "campo", id: resto.join(":") };
};

/** pt → mm (1 pt = 1/72 pulgada). */
export const ptAMm = (pt: number): number => (pt * 25.4) / 72;
/** Interlineado del papel y de la pantalla. */
export const INTERLINEA = 1.15;
const renglon = (pt: number) => ptAMm(pt) * INTERLINEA;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Las cajas de los elementos que se imprimen, en el orden del catálogo. */
export function cajasDeLaHoja(hoja: DisposicionHoja, cat: CatalogoFormato): Map<string, CajaMm> {
  const out = new Map<string, CajaMm>();
  for (const c of cat.campos) {
    const p = hoja.campos[c.id];
    if (p?.visible) out.set(claveElemento({ tipo: "campo", id: c.id }), { x: p.x, y: p.y, ancho: p.anchoMm, alto: renglon(p.letraPt) });
  }
  const t = hoja.tabla;
  for (const c of cat.columnas) {
    const p = t.columnas[c.id];
    if (p?.visible) out.set(claveElemento({ tipo: "columna", id: c.id }), { x: p.x, y: t.y, ancho: p.anchoMm, alto: renglon(t.letraPt) });
  }
  return out;
}

export function unionCajas(cajas: readonly CajaMm[]): CajaMm | null {
  if (cajas.length === 0) return null;
  const x0 = Math.min(...cajas.map((c) => c.x));
  const y0 = Math.min(...cajas.map((c) => c.y));
  const x1 = Math.max(...cajas.map((c) => c.x + c.ancho));
  const y1 = Math.max(...cajas.map((c) => c.y + c.alto));
  return { x: x0, y: y0, ancho: x1 - x0, alto: y1 - y0 };
}

// ── Alinear, repartir, igualar ──────────────────────────────────────────────
export type ModoAlinear = "arriba" | "medio" | "abajo" | "izq" | "centro" | "der";

/** Todos a la fila (Y) o a la columna (X) del PRIMERO elegido, que no se mueve. */
export function alinear(cajas: Map<string, CajaMm>, elegidos: readonly string[], modo: ModoAlinear): Movimientos {
  const ref = cajas.get(elegidos[0] ?? "");
  if (!ref) return {};
  const out: Movimientos = {};
  for (const k of elegidos.slice(1)) {
    const c = cajas.get(k);
    if (!c) continue;
    if (modo === "arriba") out[k] = { y: ref.y };
    else if (modo === "medio") out[k] = { y: r2(ref.y + ref.alto / 2 - c.alto / 2) };
    else if (modo === "abajo") out[k] = { y: r2(ref.y + ref.alto - c.alto) };
    else if (modo === "izq") out[k] = { x: ref.x };
    else if (modo === "centro") out[k] = { x: r2(ref.x + ref.ancho / 2 - c.ancho / 2) };
    else out[k] = { x: r2(ref.x + ref.ancho - c.ancho) };
  }
  return out;
}

/**
 * Mismo espacio entre campos: el de más a la izquierda (o más arriba) y el del
 * otro extremo quedan; los del medio se reparten con huecos iguales. Si no
 * entran sin pisarse (huecos negativos), se reparten los comienzos.
 * En vertical las columnas no cuentan: todas viven en la Y de la tabla.
 */
export function repartir(cajas: Map<string, CajaMm>, elegidos: readonly string[], eje: "h" | "v"): Movimientos {
  const items = elegidos
    .filter((k) => cajas.has(k) && (eje === "h" || !k.startsWith("columna:")))
    .map((k) => ({ k, c: cajas.get(k) as CajaMm }));
  if (items.length < 3) return {};
  const ini = (c: CajaMm) => (eje === "h" ? c.x : c.y);
  const largo = (c: CajaMm) => (eje === "h" ? c.ancho : c.alto);
  items.sort((a, b) => ini(a.c) - ini(b.c));
  const primero = items[0].c;
  const ultimo = items[items.length - 1].c;
  const tramo = ini(ultimo) + largo(ultimo) - ini(primero);
  const ocupado = items.reduce((s, it) => s + largo(it.c), 0);
  const hueco = (tramo - ocupado) / (items.length - 1);
  const out: Movimientos = {};
  if (hueco >= 0) {
    let pos = ini(primero) + largo(primero) + hueco;
    for (const it of items.slice(1, -1)) {
      out[it.k] = eje === "h" ? { x: r2(pos) } : { y: r2(pos) };
      pos += largo(it.c) + hueco;
    }
  } else {
    const paso = (ini(ultimo) - ini(primero)) / (items.length - 1);
    items.slice(1, -1).forEach((it, i) => {
      const pos = r2(ini(primero) + paso * (i + 1));
      out[it.k] = eje === "h" ? { x: pos } : { y: pos };
    });
  }
  return out;
}

/** Aplica los movimientos: X/Y acotados a lo que el servidor acepta; la Y de una columna es la de la tabla. */
export function aplicarMovimientos(hoja: DisposicionHoja, movs: Movimientos): DisposicionHoja {
  const campos = { ...hoja.campos };
  const columnas = { ...hoja.tabla.columnas };
  let yTabla = hoja.tabla.y;
  for (const [k, m] of Object.entries(movs)) {
    const e = elementoDeClave(k);
    if (e.tipo === "campo" && campos[e.id]) {
      campos[e.id] = { ...campos[e.id], ...(m.x != null && { x: acotarPos(m.x) }), ...(m.y != null && { y: acotarPos(m.y) }) };
    } else if (e.tipo === "columna" && columnas[e.id]) {
      if (m.x != null) columnas[e.id] = { ...columnas[e.id], x: acotarPos(m.x) };
      if (m.y != null) yTabla = acotarPos(m.y);
    }
  }
  return { ...hoja, campos, tabla: { ...hoja.tabla, y: yTabla, columnas } };
}

/**
 * Corre a todos los elegidos `dx`/`dy` desde donde estaban al empezar
 * (`inicio`). El tope se aplica al GRUPO: contra el borde se frena entero, no
 * se aplastan los de afuera mientras los de adentro siguen.
 */
export function moverDesde(inicio: ReadonlyMap<string, CajaMm>, dx: number, dy: number): Movimientos {
  const cs = [...inicio.values()];
  if (cs.length === 0) return {};
  const tope = (d: number, vals: number[]) => Math.min(POS_MAX_MM - Math.max(...vals), Math.max(POS_MIN_MM - Math.min(...vals), d));
  const ddx = tope(dx, cs.map((c) => c.x));
  const ddy = tope(dy, cs.map((c) => c.y));
  const out: Movimientos = {};
  for (const [k, c] of inicio) out[k] = { x: r2(c.x + ddx), y: r2(c.y + ddy) };
  return out;
}

/** El ancho o la letra del primero para todos. Las columnas comparten la letra de la tabla. */
export function igualar(hoja: DisposicionHoja, elegidos: readonly string[], que: "ancho" | "letra"): DisposicionHoja {
  const [refK, ...resto] = elegidos;
  if (!refK) return hoja;
  const ref = elementoDeClave(refK);
  const refCampo = ref.tipo === "campo" ? hoja.campos[ref.id] : null;
  const refCol = ref.tipo === "columna" ? hoja.tabla.columnas[ref.id] : null;
  const ancho = refCampo?.anchoMm ?? refCol?.anchoMm;
  const letra = refCampo?.letraPt ?? hoja.tabla.letraPt;
  const campos = { ...hoja.campos };
  const columnas = { ...hoja.tabla.columnas };
  let letraTabla = hoja.tabla.letraPt;
  for (const k of resto) {
    const e = elementoDeClave(k);
    if (e.tipo === "campo" && campos[e.id]) {
      campos[e.id] = que === "ancho" && ancho != null ? { ...campos[e.id], anchoMm: ancho } : que === "letra" ? { ...campos[e.id], letraPt: letra } : campos[e.id];
    } else if (e.tipo === "columna" && columnas[e.id]) {
      if (que === "ancho" && ancho != null) columnas[e.id] = { ...columnas[e.id], anchoMm: ancho };
      if (que === "letra") letraTabla = letra;
    }
  }
  return { ...hoja, campos, tabla: { ...hoja.tabla, letraPt: letraTabla, columnas } };
}

// ── Elegir ──────────────────────────────────────────────────────────────────
/** Tolerancia de «la misma fila / columna». */
export const TOLERANCIA_FILA_MM = 2;

/** Los que están en la fila (Y a ±2 mm) o en la columna (X a ±2 mm) del primero; él va primero. */
export function elegirAlineados(cajas: Map<string, CajaMm>, ref: string, eje: "fila" | "columna", tol = TOLERANCIA_FILA_MM): string[] {
  const r = cajas.get(ref);
  if (!r) return [];
  const otros = [...cajas].filter(([k, c]) => k !== ref && Math.abs(eje === "fila" ? c.y - r.y : c.x - r.x) <= tol + 1e-9).map(([k]) => k);
  return [ref, ...otros];
}

/** Los que el recuadro toca, en el orden del catálogo. */
export function enRecuadro(cajas: Map<string, CajaMm>, r: CajaMm): string[] {
  return [...cajas]
    .filter(([, c]) => c.x < r.x + r.ancho && r.x < c.x + c.ancho && c.y < r.y + r.alto && r.y < c.y + c.alto)
    .map(([k]) => k);
}

// ── Imán y guías ────────────────────────────────────────────────────────────
export const PASOS_IMAN = [0, 0.5, 1, 5] as const;
export type PasoIman = (typeof PASOS_IMAN)[number];

/** A la cuadrícula del imán; apagado (0) deja décimas de mm. */
export function imantar(v: number, paso: number): number {
  if (!(paso > 0)) return Math.round(v * 10) / 10;
  return r2(Math.round(v / paso) * paso);
}

export interface Guias {
  x: number[];
  y: number[];
}

/**
 * Las líneas de alineación al arrastrar: si un borde o el centro de lo que se
 * mueve queda a menos de `tol` de un borde o centro de otro campo, se pega
 * (devuelve cuánto corregir) y se dibuja la línea. Gana la más cercana por eje.
 */
export function guiasDeAlineacion(mov: CajaMm, otras: readonly CajaMm[], tol: number): { dx: number; dy: number; guias: Guias } {
  const lineas = (c: CajaMm, eje: "x" | "y") =>
    eje === "x" ? [c.x, c.x + c.ancho / 2, c.x + c.ancho] : [c.y, c.y + c.alto / 2, c.y + c.alto];
  const mejor = (eje: "x" | "y") => {
    let d: number | null = null;
    let linea = 0;
    for (const o of otras) {
      for (const a of lineas(mov, eje)) {
        for (const b of lineas(o, eje)) {
          const delta = b - a;
          if (Math.abs(delta) <= tol && (d == null || Math.abs(delta) < Math.abs(d))) {
            d = delta;
            linea = b;
          }
        }
      }
    }
    return { d, linea };
  };
  const mx = mejor("x");
  const my = mejor("y");
  return {
    dx: mx.d ?? 0,
    dy: my.d ?? 0,
    guias: { x: mx.d != null ? [r2(mx.linea)] : [], y: my.d != null ? [r2(my.linea)] : [] },
  };
}

// ── Deshacer / rehacer ──────────────────────────────────────────────────────
export interface Historial<T> {
  pasado: T[];
  futuro: T[];
}
/** Pasos que se recuerdan (Brandon: «al menos 50»). */
export const HISTORIAL_MAX = 100;
export const historialVacio = <T>(): Historial<T> => ({ pasado: [], futuro: [] });

/** Antes de un cambio: lo de ahora pasa al pasado y lo rehecho se pierde. */
export function empujar<T>(h: Historial<T>, actual: T, max = HISTORIAL_MAX): Historial<T> {
  return { pasado: [...h.pasado, actual].slice(-max), futuro: [] };
}
export function deshacer<T>(h: Historial<T>, actual: T): { h: Historial<T>; valor: T } | null {
  if (h.pasado.length === 0) return null;
  return { h: { pasado: h.pasado.slice(0, -1), futuro: [actual, ...h.futuro] }, valor: h.pasado[h.pasado.length - 1] };
}
export function rehacer<T>(h: Historial<T>, actual: T): { h: Historial<T>; valor: T } | null {
  if (h.futuro.length === 0) return null;
  return { h: { pasado: [...h.pasado, actual], futuro: h.futuro.slice(1) }, valor: h.futuro[0] };
}

// ── Lupa ────────────────────────────────────────────────────────────────────
/** 100 % = tamaño real (96 px por pulgada). */
export const PX_POR_MM = 96 / 25.4;
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 4;
export const ZOOM_PASO = 0.25;

/** El siguiente escalón de 25 % hacia arriba o hacia abajo (desde un zoom de «ajustar» que cae entre dos). */
export function zoomSiguiente(z: number, dir: 1 | -1): number {
  const n = z / ZOOM_PASO;
  const escalon = dir > 0 ? Math.floor(n + 1e-6) + 1 : Math.ceil(n - 1e-6) - 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, escalon * ZOOM_PASO));
}

/** El zoom que hace entrar la hoja: al ancho, o entera (ancho y alto). */
export function zoomQueEntra(dispAnchoPx: number, dispAltoPx: number, hoja: { anchoMm: number; altoMm: number }, modo: "ancho" | "hoja"): number {
  const porAncho = dispAnchoPx / (hoja.anchoMm * PX_POR_MM);
  const porAlto = dispAltoPx / (hoja.altoMm * PX_POR_MM);
  const z = modo === "ancho" ? porAncho : Math.min(porAncho, porAlto);
  return Math.min(ZOOM_MAX, Math.max(0.05, z));
}
