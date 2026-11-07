/**
 * loth-mapa-etiquetas — dónde va la etiqueta de cada árbol del censo sobre el
 * mapa («114 · Trozado ×3»), para que 67 árboles no se vuelvan una sopa de
 * texto: cada etiqueta prueba a la derecha, a la izquierda, arriba, abajo y
 * en las cuatro esquinas de su punto, y se pone en el primer lado donde no
 * pisa otra etiqueta ni el símbolo de otro árbol. Si no entra en ninguno, no se pone (el árbol se lee
 * al pasar el mouse o al tocarlo).
 *
 * Van primero las que más dicen: el árbol elegido y el más cercano (esos se
 * ponen siempre), los que tienen un aviso, y la cadena de atrás para adelante
 * (en el CTP, despachado, trozado, talado); los en pie, al final.
 *
 * Por debajo de `ZOOM_ETIQUETAS` no se pone ninguna salvo esas dos: de lejos
 * los árboles están a 2-3 px entre sí y lo que se lee es la mancha.
 *
 * Puro (sin Leaflet, sin DOM): recibe los puntos ya en píxeles de pantalla.
 */

import type { EtapaArbol } from "@/lib/forestal/loth-etapa-arbol";

export type ModoEtiquetas = "etapa" | "codigo" | "ninguna";
export const MODOS_ETIQUETAS: readonly ModoEtiquetas[] = ["etapa", "codigo", "ninguna"];
export const MODO_ETIQUETAS_LABEL: Record<ModoEtiquetas, string> = {
  etapa: "Etiquetas: código y etapa",
  codigo: "Etiquetas: sólo el código",
  ninguna: "Sin etiquetas",
};
/** Dónde se recuerda el modo (por navegador). */
export const CLAVE_MODO_ETIQUETAS = "loth:mapa:etiquetas";

export const esModoEtiquetas = (v: unknown): v is ModoEtiquetas => typeof v === "string" && (MODOS_ETIQUETAS as readonly string[]).includes(v);

/**
 * Desde este zoom se ponen las etiquetas. Medido con los 65 árboles de Blas
 * (test `forestal-loth-mapa-etiquetas`): el mapa abre en 16, con el área
 * entera en pantalla, y ahí entran 27 etiquetas sin pisarse; en 15 el área
 * mide 200 px y las 18 que entrarían tapan el monte; en 17 entran 35 de las
 * 48 a la vista, y en 18, 20 de 21.
 */
export const ZOOM_ETIQUETAS = 16;

/** Más de esto a la vista y sólo se ponen la del elegido y la del más cercano. */
export const MAX_ETIQUETAS_EVALUADAS = 600;

/**
 * Lo que va encima del mapa cambió de tamaño sin que el mapa se moviera (la
 * leyenda se plegó, se abrió un panel): quien lo cambia avisa con este evento
 * de ventana y la capa del censo vuelve a acomodar las etiquetas.
 */
export const EVENTO_TAPAS_MAPA = "loth:mapa-tapas";

export function avisarTapasDelMapa(): void {
  if (typeof window === "undefined") return;
  // Después del próximo cuadro: el DOM nuevo ya está medido.
  window.requestAnimationFrame(() => window.dispatchEvent(new Event(EVENTO_TAPAS_MAPA)));
}

export type LadoEtiqueta = "der" | "izq" | "arriba" | "abajo" | "der-arriba" | "der-abajo" | "izq-arriba" | "izq-abajo" | "no";
/** En este orden de preferencia: a los costados se lee mejor (el texto corre en la misma línea). */
const LADOS: readonly Exclude<LadoEtiqueta, "no">[] = ["der", "izq", "arriba", "abajo", "der-arriba", "der-abajo", "izq-arriba", "izq-abajo"];

/** Distancia (px) del centro del símbolo al borde de su etiqueta: deja libres las insignias. */
export const SEPARACION_ETIQUETA = 14;
/** En las esquinas: 12 px de costado y 10 de alto (la insignia apenas queda rozada). */
const DIAG_X = 12;
const DIAG_Y = 10;
/** Radio (px) del símbolo de OTRO árbol que una etiqueta no puede tapar. */
export const RADIO_SIMBOLO = 8;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CajaEtiqueta {
  id: string;
  /** Centro del símbolo, en px del contenedor del mapa. */
  x: number;
  y: number;
  /** Tamaño medido de la etiqueta (0 = todavía no se midió: no se pone). */
  w: number;
  h: number;
  /** Menor = va antes. */
  prioridad: number;
  /** Se pone siempre (el elegido, el más cercano), aunque pise. */
  fija?: boolean;
}

export function rectDeLado(lado: Exclude<LadoEtiqueta, "no">, c: Pick<CajaEtiqueta, "x" | "y" | "w" | "h">): Rect {
  const s = SEPARACION_ETIQUETA;
  switch (lado) {
    case "der":
      return { x: c.x + s, y: c.y - c.h / 2, w: c.w, h: c.h };
    case "izq":
      return { x: c.x - s - c.w, y: c.y - c.h / 2, w: c.w, h: c.h };
    case "arriba":
      return { x: c.x - c.w / 2, y: c.y - s - c.h, w: c.w, h: c.h };
    case "abajo":
      return { x: c.x - c.w / 2, y: c.y + s, w: c.w, h: c.h };
    case "der-arriba":
      return { x: c.x + DIAG_X, y: c.y - DIAG_Y - c.h, w: c.w, h: c.h };
    case "der-abajo":
      return { x: c.x + DIAG_X, y: c.y + DIAG_Y, w: c.w, h: c.h };
    case "izq-arriba":
      return { x: c.x - DIAG_X - c.w, y: c.y - DIAG_Y - c.h, w: c.w, h: c.h };
    case "izq-abajo":
      return { x: c.x - DIAG_X - c.w, y: c.y + DIAG_Y, w: c.w, h: c.h };
  }
}

const seTocan = (a: Rect, b: Rect, holgura: number) =>
  a.x < b.x + b.w + holgura && b.x < a.x + a.w + holgura && a.y < b.y + b.h + holgura && b.y < a.y + a.h + holgura;

/**
 * El lado de cada etiqueta. `vista` es el tamaño del mapa en px: una etiqueta
 * que se saldría del borde prueba otro lado (cortada no se lee).
 */
export function ubicarEtiquetas(
  cajas: readonly CajaEtiqueta[],
  vista: { ancho: number; alto: number },
  opts: {
    holgura?: number;
    /** Lo que tapa el mapa (leyenda, escala, zoom, la ficha abierta): una etiqueta ahí abajo no se lee. */
    tapas?: readonly Rect[];
  } = {},
): Map<string, LadoEtiqueta> {
  const holgura = opts.holgura ?? 2;
  const tapas = opts.tapas ?? [];
  const out = new Map<string, LadoEtiqueta>();
  const puestas: Rect[] = [];
  const r = RADIO_SIMBOLO;
  const simbolos = cajas.map((c) => ({ id: c.id, rect: { x: c.x - r, y: c.y - r, w: 2 * r, h: 2 * r } }));
  const demasiadas = cajas.length > MAX_ETIQUETAS_EVALUADAS;
  const orden = [...cajas].sort((a, b) => a.prioridad - b.prioridad || a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));

  for (const c of orden) {
    if (c.w <= 0 || c.h <= 0 || (demasiadas && !c.fija)) {
      out.set(c.id, "no");
      continue;
    }
    let elegido: LadoEtiqueta = "no";
    for (const lado of LADOS) {
      const rect = rectDeLado(lado, c);
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > vista.ancho || rect.y + rect.h > vista.alto) continue;
      if (puestas.some((p) => seTocan(p, rect, holgura))) continue;
      if (tapas.some((t) => seTocan(t, rect, 0))) continue;
      if (simbolos.some((s) => s.id !== c.id && seTocan(s.rect, rect, 0))) continue;
      elegido = lado;
      puestas.push(rect);
      break;
    }
    if (elegido === "no" && c.fija) {
      // Ningún lado entra limpio: se pone igual (es el elegido), pero en el que
      // MENOS tapa lo que está encima del mapa y no se sale. Antes iba siempre a
      // la derecha y podía quedar entera bajo la leyenda.
      elegido = ladoMenosTapado(c, vista, tapas);
      puestas.push(rectDeLado(elegido, c));
    }
    out.set(c.id, elegido);
  }
  return out;
}

const areaComun = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Para una etiqueta que va sí o sí: el lado cuya caja queda menos bajo las
 * tapas (leyenda, ficha, panel) y menos fuera del mapa. Empate → el orden de
 * preferencia de siempre (derecha primero).
 */
function ladoMenosTapado(c: CajaEtiqueta, vista: { ancho: number; alto: number }, tapas: readonly Rect[]): Exclude<LadoEtiqueta, "no"> {
  const mapa: Rect = { x: 0, y: 0, w: vista.ancho, h: vista.alto };
  let mejor: Exclude<LadoEtiqueta, "no"> = LADOS[0];
  let menor = Infinity;
  for (const lado of LADOS) {
    const r = rectDeLado(lado, c);
    const tapado = tapas.reduce((s, t) => s + areaComun(r, t), 0);
    const afuera = r.w * r.h - areaComun(r, mapa);
    const costo = tapado + afuera;
    if (costo < menor) {
      menor = costo;
      mejor = lado;
    }
  }
  return mejor;
}

/** Cuánto importa que se lea la etiqueta de un árbol: la cadena de atrás para adelante. */
const PRIORIDAD_ETAPA: Record<EtapaArbol, number> = {
  en_ctp: 3,
  despachado: 4,
  despachado_parcial: 5,
  trozado: 6,
  talado: 7,
  semillero: 8,
  descartado: 9,
  en_pie: 10,
};

export function prioridadDeArbol(o: { elegido: boolean; cercano: boolean; conAviso: boolean; etapa: EtapaArbol }): number {
  if (o.elegido) return 0;
  if (o.cercano) return 1;
  if (o.conAviso) return 2;
  return PRIORIDAD_ETAPA[o.etapa];
}

/**
 * Posición de la etiqueta DENTRO del marcador de Leaflet (un cuadrado de
 * `ladoMarcador` px con el símbolo al centro), como `style` en línea.
 * «no» la deja en su lugar pero invisible (y sin tomar clics).
 */
export function estiloDeLado(lado: LadoEtiqueta, ladoMarcador: number): string {
  const c = ladoMarcador / 2;
  const d = c + SEPARACION_ETIQUETA;
  const dx = c + DIAG_X;
  const dy = c + DIAG_Y;
  switch (lado) {
    case "der-arriba":
      return `left:${dx}px;bottom:${dy}px`;
    case "der-abajo":
      return `left:${dx}px;top:${dy}px`;
    case "izq-arriba":
      return `right:${dx}px;bottom:${dy}px`;
    case "izq-abajo":
      return `right:${dx}px;top:${dy}px`;
    case "izq":
      return `right:${d}px;top:50%;transform:translateY(-50%)`;
    case "arriba":
      return `bottom:${d}px;left:50%;transform:translateX(-50%)`;
    case "abajo":
      return `top:${d}px;left:50%;transform:translateX(-50%)`;
    case "no":
      return `left:${d}px;top:50%;transform:translateY(-50%);visibility:hidden`;
    default:
      return `left:${d}px;top:50%;transform:translateY(-50%)`;
  }
}
