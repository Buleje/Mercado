/**
 * La parte trasera del camión (Brandon, 2026-10-03): qué piezas van atrás,
 * cómo se ven desde la compuerta y cuánto suman.
 *
 * El cubicador marca filas como «trasera» (las que quedan a la vista al abrir
 * el camión). Acá vive TODA la cuenta, sin React ni DOM, para que el croquis
 * de la pantalla y el del PDF salgan del mismo acomodo:
 *
 *  - `formatoTrasera`: la tabla N° · especie · medida · tipo · piezas · PT · m³.
 *  - `acomodarCroquis`: cada PIEZA (una por unidad de `cantidad`) como un
 *    rectángulo de su sección espesor × ancho en pulgadas, apilado en filas
 *    («estantes») dentro del ancho del camión.
 *  - `coloresPorEspecie`: un índice de paleta estable por especie.
 *
 * Coordenadas del croquis en PULGADAS, con el origen en la esquina izquierda
 * del PISO: `x` crece hacia la derecha, `y` hacia arriba (distancia del piso
 * al canto de abajo de la pieza). Quien dibuja invierte `y` si su lienzo
 * crece hacia abajo (SVG, jsPDF).
 */
import { m3DesdePt, toInches, type PiezaCubicada } from "./cubicacion";
import { tipoDePieza, type TipoComercial } from "./cubicacion-tipo";
import { claveEspecie } from "./loth-constants";

/** Ancho interno de la tolva de un camión de carga mediano. */
export const ANCHO_CAMION_M_DEFAULT = 2.4;
export const ANCHO_CAMION_M_MIN = 1;
export const ANCHO_CAMION_M_MAX = 3.5;
export const PULG_POR_M = 1 / 0.0254;
/** Tope de rectángulos dibujados: más que esto no se lee y traba el SVG. */
export const TOPE_CROQUIS = 600;
/** Cuántos colores distintos tiene la paleta (después se repiten). */
export const COLORES_PALETA = 8;
/** Los primeros de la paleta son los de color (teal, azul, coral, morado); los
 *  que siguen son grises y tinta, para cuando hay más de cuatro especies. */
export const COLORES_VIVOS = 4;
export const SIN_ESPECIE = "Sin especie";

const EPS = 1e-9;

type PiezaTrasera = Pick<
  PiezaCubicada,
  "id" | "cantidad" | "espesor" | "ancho" | "largo" | "uEspesor" | "uAncho" | "uLargo" | "especie" | "pieTablar" | "m3" | "tipo"
>;

const nombreEspecie = (e: string | undefined): string => (e ?? "").trim() || SIN_ESPECIE;
const claveDe = (e: string | undefined): string => claveEspecie(nombreEspecie(e)) || nombreEspecie(e).toLowerCase();

/**
 * Un color por especie, estable.
 *
 * Con `catalogo` (las especies de la planta, en su orden) cada especie
 * prefiere uno de los 4 colores vivos según su lugar en el catálogo: el
 * tornillo es del mismo color hoy y mañana, aunque se sume capirona a la
 * trasera. Si dos de las presentes caen en el mismo, la segunda toma el
 * siguiente vivo libre y, agotados, un gris: en un mismo croquis dos especies
 * nunca comparten color (hasta 8). Medido 03-10: con el lugar del catálogo
 * módulo 8, el tornillo (6.º) salía negro y la cumala gris.
 * Las que el catálogo no tiene van después, por nombre. No depende del orden
 * de las filas, y la pantalla y el PDF dan los mismos colores.
 */
export function coloresPorEspecie(
  piezas: readonly Pick<PiezaTrasera, "especie">[],
  catalogo: readonly string[] = [],
): Map<string, number> {
  const rangoCat = new Map<string, number>();
  catalogo.forEach((e, i) => {
    const k = claveDe(e);
    if (!rangoCat.has(k)) rangoCat.set(k, i);
  });
  const rango = (k: string) => rangoCat.get(k) ?? Number.POSITIVE_INFINITY;
  const claves = [...new Set(piezas.map((p) => claveDe(p.especie)))]
    .sort((a, b) => rango(a) - rango(b) || a.localeCompare(b, "es"));
  const usados = new Set<number>();
  const colores = new Map<string, number>();
  for (const k of claves) {
    const r = rango(k);
    const pref = Number.isFinite(r) ? r % COLORES_VIVOS : 0;
    const candidatos = [
      ...Array.from({ length: COLORES_VIVOS }, (_, i) => (pref + i) % COLORES_VIVOS),
      ...Array.from({ length: COLORES_PALETA - COLORES_VIVOS }, (_, i) => COLORES_VIVOS + i),
    ];
    const c = candidatos.find((x) => !usados.has(x)) ?? pref;
    usados.add(c);
    colores.set(k, c);
  }
  return colores;
}

/** El color de una pieza según el mapa de `coloresPorEspecie`. */
export const colorDe = (colores: ReadonlyMap<string, number>, especie: string | undefined): number =>
  colores.get(claveDe(especie)) ?? 0;

export interface FilaTrasera {
  n: number;
  id: string;
  especie: string;
  color: number;
  medida: string;
  tipo: TipoComercial;
  piezas: number;
  pt: number;
  m3: number;
}

export interface FormatoTrasera {
  filas: FilaTrasera[];
  totales: { piezas: number; pt: number; m3: number };
}

/**
 * La tabla de la trasera, en el orden en que llegan las filas (el de la tabla
 * del cubicador). El m³ total sale del PT total ÷ 424, mismo criterio que el
 * total del cubicador: sumar los m³ ya redondeados de cada fila se corre.
 */
export function formatoTrasera(piezas: readonly PiezaTrasera[], catalogo: readonly string[] = []): FormatoTrasera {
  const colores = coloresPorEspecie(piezas, catalogo);
  const filas = piezas.map((p, i): FilaTrasera => ({
    n: i + 1,
    id: p.id,
    especie: nombreEspecie(p.especie),
    color: colorDe(colores, p.especie),
    medida: `${p.espesor}×${p.ancho}×${p.largo}`,
    tipo: tipoDePieza(p),
    piezas: p.cantidad,
    pt: p.pieTablar,
    m3: p.m3,
  }));
  const pt = filas.reduce((a, f) => a + f.pt, 0);
  return { filas, totales: { piezas: filas.reduce((a, f) => a + f.piezas, 0), pt, m3: m3DesdePt(pt) } };
}

export interface RectanguloCroquis {
  /** Pulgadas desde la pared izquierda. */
  x: number;
  /** Pulgadas desde el piso hasta el canto de abajo. */
  y: number;
  w: number;
  h: number;
  filaId: string;
  especie: string;
  color: number;
  /** Lo que se rotula dentro del rectángulo: «2×8». */
  etiqueta: string;
  /** La medida completa, para el `title`: «2×8×10 · Tornillo». */
  detalle: string;
}

export interface LeyendaEspecie {
  especie: string;
  color: number;
  piezas: number;
}

export interface Croquis {
  anchoPulg: number;
  /** Alto de la pila completa (todas las piezas, también las que no se dibujan). */
  altoPulg: number;
  rects: RectanguloCroquis[];
  /** Piezas que entran en el ancho (dibujadas + `sinDibujar`). */
  total: number;
  sinDibujar: number;
  /** Piezas más anchas que el camión o sin medida: no se pueden acomodar. */
  noCaben: number;
  leyenda: LeyendaEspecie[];
}

/**
 * Acomoda las piezas en «estantes», como se carga a mano: las más gruesas
 * abajo y, dentro del mismo grosor, las más anchas primero; cada estante se
 * llena de izquierda a derecha y, cuando la siguiente no entra, se empieza
 * otro encima, a la altura de la más gruesa del de abajo.
 *
 * Orden total y determinista (espesor ↓, ancho ↓, especie, id de fila): la
 * misma trasera dibuja siempre el mismo croquis. Se calcula la pila ENTERA
 * para el alto, pero se devuelven a lo sumo `tope` rectángulos; el resto se
 * cuenta en `sinDibujar` para el «+N más».
 */
export function acomodarCroquis(
  piezas: readonly PiezaTrasera[],
  opciones: { anchoM?: number; tope?: number; catalogo?: readonly string[] } = {},
): Croquis {
  const anchoM = Math.min(ANCHO_CAMION_M_MAX, Math.max(ANCHO_CAMION_M_MIN, opciones.anchoM ?? ANCHO_CAMION_M_DEFAULT));
  const tope = Math.max(0, Math.floor(opciones.tope ?? TOPE_CROQUIS));
  const W = anchoM * PULG_POR_M;
  const colores = coloresPorEspecie(piezas, opciones.catalogo);

  const leyendaPorClave = new Map<string, LeyendaEspecie>();
  const grupos = piezas
    .map((p) => {
      const h = toInches(p.espesor, p.uEspesor);
      const w = toInches(p.ancho, p.uAncho);
      const cantidad = Number.isFinite(p.cantidad) ? Math.max(0, Math.floor(p.cantidad)) : 0;
      const clave = claveDe(p.especie);
      const ley = leyendaPorClave.get(clave) ?? { especie: nombreEspecie(p.especie), color: colorDe(colores, p.especie), piezas: 0 };
      ley.piezas += cantidad;
      leyendaPorClave.set(clave, ley);
      return { p, h, w, cantidad, clave };
    })
    .sort((a, b) => b.h - a.h || b.w - a.w || a.clave.localeCompare(b.clave, "es") || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0));

  const rects: RectanguloCroquis[] = [];
  let total = 0;
  let noCaben = 0;
  let x = 0;
  let yEstante = 0;
  let altoEstante = 0;
  for (const g of grupos) {
    if (g.cantidad === 0) continue;
    if (!(g.h > 0) || !(g.w > 0) || g.w > W + EPS) {
      noCaben += g.cantidad;
      continue;
    }
    const especie = nombreEspecie(g.p.especie);
    const color = colorDe(colores, g.p.especie);
    const etiqueta = `${g.p.espesor}×${g.p.ancho}`;
    const detalle = `${g.p.espesor}×${g.p.ancho}×${g.p.largo} · ${especie}`;
    /* Piezas iguales en bloque: los que entran por estante se resuelven con
       una división, no con un bucle por pieza — una fila de 5 000 piezas no
       puede costar 5 000 vueltas sólo para saber el alto. */
    let restantes = g.cantidad;
    while (restantes > 0) {
      if (x + g.w > W + EPS) {
        yEstante += altoEstante;
        x = 0;
        altoEstante = 0;
      }
      const entran = Math.max(1, Math.min(restantes, Math.floor((W - x + EPS) / g.w)));
      for (let k = 0; k < entran && rects.length < tope; k++) {
        rects.push({ x: x + k * g.w, y: yEstante, w: g.w, h: g.h, filaId: g.p.id, especie, color, etiqueta, detalle });
      }
      x += entran * g.w;
      altoEstante = Math.max(altoEstante, g.h);
      restantes -= entran;
      total += entran;
    }
  }

  const leyenda = [...leyendaPorClave.values()]
    .filter((l) => l.piezas > 0)
    .sort((a, b) => b.piezas - a.piezas || a.especie.localeCompare(b.especie, "es"));
  return { anchoPulg: W, altoPulg: yEstante + altoEstante, rects, total, sinDibujar: total - rects.length, noCaben, leyenda };
}

/** Pulgadas → metros con 2 decimales, para rotular el croquis. */
export const pulgAMetros = (pulg: number): number => Math.round((pulg / PULG_POR_M) * 100) / 100;
