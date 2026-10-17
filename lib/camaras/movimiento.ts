/**
 * Movimiento en el video de una cámara (ADR-475, 2026-10-08): compara cada
 * cuadro con un fondo aprendido y devuelve las manchas que cambiaron.
 *
 * Por qué: en las cámaras del aserradero una persona mide 10-25 px en un
 * cuadro de 768×432 y ningún detector la ve mirando el cuadro entero (medido:
 * 0 de 8). Donde algo se mueve se hace zoom y ahí sí la ve. El movimiento,
 * además, es lo que Brandon pidió ver marcado.
 *
 * Puro (sin DOM): recibe el cuadro en gris en una grilla chica (p. ej. 192×108)
 * y guarda el fondo como promedio móvil. Lo que se queda quieto se va
 * fundiendo en el fondo; un cambio de luz que toca media imagen (nube, el IR
 * de la noche, la cámara que gira) reinicia el fondo en vez de marcar todo.
 */

import type { CajaFraccion } from "./vigia";
import { filtrarCajasIgnoradas, type ZonaIgnorada } from "./zonas-ignorar";

export interface FondoMovimiento {
  ancho: number;
  alto: number;
  media: Float32Array;
  /** Cuadros vistos desde el último reinicio. */
  cuadros: number;
}

export interface OpcionesMovimiento {
  /** Diferencia de gris (0-255) para que un punto cuente como cambio. */
  umbral: number;
  /** Cuánto aprende el fondo por cuadro donde NO hay cambio (0-1). */
  aprendizaje: number;
  /** Ídem donde SÍ hay cambio: más lento, así una persona quieta tarda en desaparecer. */
  aprendizajeEnCambio: number;
  /** Puntos mínimos de una mancha (en la grilla). */
  minPuntos: number;
  /** Distancia (en puntos de grilla) a la que dos cambios son la misma mancha. */
  union: number;
  /** Si cambia más que esta fracción del cuadro, es la luz: se reinicia el fondo. */
  maxFraccionCambio: number;
}

export const OPCIONES_MOVIMIENTO: OpcionesMovimiento = {
  umbral: 22,
  aprendizaje: 0.08,
  aprendizajeEnCambio: 0.02,
  minPuntos: 3,
  union: 2,
  maxFraccionCambio: 0.35,
};

export interface ResultadoMovimiento {
  manchas: CajaFraccion[];
  /** Fracción del cuadro que cambió (0-1). */
  cambio: number;
  /** El fondo se (re)armó con este cuadro: no hay manchas que creerle. */
  reiniciado: boolean;
}

export function crearFondo(ancho: number, alto: number): FondoMovimiento {
  return { ancho, alto, media: new Float32Array(ancho * alto), cuadros: 0 };
}

function reiniciar(f: FondoMovimiento, gris: Uint8Array): void {
  for (let i = 0; i < f.media.length; i++) f.media[i] = gris[i];
  f.cuadros = 1;
}

/** Componentes conexas de `mascara`, tolerando huecos de `union` puntos. */
function manchasDe(
  mascara: Uint8Array,
  ancho: number,
  alto: number,
  union: number,
  minPuntos: number,
): CajaFraccion[] {
  const visto = new Uint8Array(mascara.length);
  const pila: number[] = [];
  const out: CajaFraccion[] = [];
  for (let i = 0; i < mascara.length; i++) {
    if (!mascara[i] || visto[i]) continue;
    let [x0, y0, x1, y1, n] = [ancho, alto, 0, 0, 0];
    visto[i] = 1;
    pila.push(i);
    while (pila.length) {
      const j = pila.pop() as number;
      const x = j % ancho;
      const y = (j - x) / ancho;
      n++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -union; dy <= union; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= alto) continue;
        for (let dx = -union; dx <= union; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= ancho) continue;
          const k = yy * ancho + xx;
          if (mascara[k] && !visto[k]) {
            visto[k] = 1;
            pila.push(k);
          }
        }
      }
    }
    if (n >= minPuntos)
      out.push({
        x: x0 / ancho,
        y: y0 / alto,
        ancho: (x1 - x0 + 1) / ancho,
        alto: (y1 - y0 + 1) / alto,
      });
  }
  return out;
}

/**
 * Compara `gris` (ancho×alto, un byte por punto) con el fondo, devuelve las
 * manchas en fracciones y actualiza el fondo. Muta `fondo`.
 */
export function compararConFondo(
  fondo: FondoMovimiento,
  gris: Uint8Array,
  opciones: OpcionesMovimiento = OPCIONES_MOVIMIENTO,
): ResultadoMovimiento {
  const { ancho, alto, media } = fondo;
  if (gris.length !== media.length) throw new Error("el cuadro no tiene el tamaño del fondo");
  if (fondo.cuadros === 0) {
    reiniciar(fondo, gris);
    return { manchas: [], cambio: 0, reiniciado: true };
  }

  const mascara = new Uint8Array(media.length);
  let cambiados = 0;
  for (let i = 0; i < media.length; i++) {
    if (Math.abs(gris[i] - media[i]) > opciones.umbral) {
      mascara[i] = 1;
      cambiados++;
    }
  }
  const cambio = cambiados / media.length;
  if (cambio > opciones.maxFraccionCambio) {
    reiniciar(fondo, gris);
    return { manchas: [], cambio, reiniciado: true };
  }

  for (let i = 0; i < media.length; i++) {
    const a = mascara[i] ? opciones.aprendizajeEnCambio : opciones.aprendizaje;
    media[i] += a * (gris[i] - media[i]);
  }
  fondo.cuadros++;
  return {
    manchas: manchasDe(mascara, ancho, alto, opciones.union, opciones.minPuntos),
    cambio,
    reiniciado: false,
  };
}

/**
 * El recorte cuadrado donde conviene mirar con zoom una mancha: centrado en
 * ella, `factor` veces su lado mayor y nunca menor que `minLado` (fracción del
 * ALTO del cuadro). Devuelve fracciones del cuadro, adentro de sus bordes.
 * `aspecto` = ancho/alto del cuadro en píxeles (16/9 en las cámaras).
 */
export function recorteParaMancha(
  m: CajaFraccion,
  aspecto: number,
  factor = 2.2,
  minLado = 0.3,
): CajaFraccion {
  // Lado del cuadrado en fracciones del ALTO; en el eje X vale `lado / aspecto`.
  const lado = Math.min(1, Math.max(minLado, Math.max(m.alto, m.ancho * aspecto) * factor));
  const ancho = Math.min(1, lado / aspecto);
  const cx = m.x + m.ancho / 2;
  const cy = m.y + m.alto / 2;
  return {
    x: Math.min(1 - ancho, Math.max(0, cx - ancho / 2)),
    y: Math.min(1 - lado, Math.max(0, cy - lado / 2)),
    ancho,
    alto: lado,
  };
}

/** Intersección sobre unión de dos cajas. */
export function iou(a: CajaFraccion, b: CajaFraccion): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.ancho, b.x + b.ancho);
  const y2 = Math.min(a.y + a.alto, b.y + b.alto);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.ancho * a.alto + b.ancho * b.alto - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Junta recortes que se pisan mucho (dos manchas de la misma persona) en uno
 * que cubre a ambos, y se queda con los `max` más grandes.
 */
export function unirRecortes(recortes: CajaFraccion[], max: number): CajaFraccion[] {
  const out: CajaFraccion[] = [];
  for (const r of [...recortes].sort((a, b) => b.ancho * b.alto - a.ancho * a.alto)) {
    const otro = out.find((o) => iou(o, r) > 0.3);
    if (!otro) {
      out.push({ ...r });
      continue;
    }
    const x2 = Math.max(otro.x + otro.ancho, r.x + r.ancho);
    const y2 = Math.max(otro.y + otro.alto, r.y + r.alto);
    otro.x = Math.min(otro.x, r.x);
    otro.y = Math.min(otro.y, r.y);
    otro.ancho = x2 - otro.x;
    otro.alto = y2 - otro.y;
  }
  return out.slice(0, max);
}

/** Una persona seguida, con cuánto hace que el movimiento la tocó por última vez. */
export interface SeguidaParaRecorte extends CajaFraccion {
  movidaHaceMs: number;
}

export interface OpcionesRecortes {
  /** Ancho/alto del cuadro en píxeles. */
  aspecto: number;
  max: number;
  zonas: readonly ZonaIgnorada[];
  /** Una seguida quieta más que esto deja de mirarse con zoom. */
  quietaMaxMs: number;
}

/**
 * Dónde mirar con zoom (ADR-475, revisión del 08-10):
 * - las manchas que caen en una zona ignorada no gastan recortes (una lona que
 *   flamea se comía los 4 y el barrido no corría nunca);
 * - las personas seguidas primero, pero a lo sumo `max - 1` si hay manchas:
 *   con 4 seguidas, alguien nuevo no entraba;
 * - una seguida quieta más de `quietaMaxMs` deja de mirarse: un poste tomado
 *   por persona quedaba seguido para siempre (y una foto «sigue» por minuto).
 * El orden de `seguidas` decide quién entra si no alcanzan los cupos: quien
 * llama las va turnando.
 */
export function elegirRecortes(
  manchas: readonly CajaFraccion[],
  seguidas: readonly SeguidaParaRecorte[],
  o: OpcionesRecortes,
): CajaFraccion[] {
  const libres = filtrarCajasIgnoradas(manchas, 1, 1, o.zonas).quedan;
  const vivas = seguidas.filter((p) => p.movidaHaceMs <= o.quietaMaxMs);
  const cupo = libres.length > 0 ? Math.max(0, o.max - 1) : o.max;
  const deSeguidas = unirRecortes(
    vivas.map((p) => recorteParaMancha(p, o.aspecto)),
    cupo,
  );
  const deManchas = unirRecortes(
    libres.map((m) => recorteParaMancha(m, o.aspecto)),
    o.max,
  ).filter((r) => !deSeguidas.some((q) => iou(q, r) > 0.3));
  return [...deSeguidas, ...deManchas].slice(0, o.max);
}
