/**
 * Seguimiento de personas entre miradas (ADR-475, 2026-10-08): a cada caja que
 * entrega el detector le asigna un número estable («Persona 1», «Persona 2»)
 * mientras siga en cuadro.
 *
 * Puro. Empareja por cercanía (IoU o centros cercanos: las cajas de 10-20 px
 * saltan unos píxeles de un cuadro a otro). Una persona que el detector no ve
 * en una mirada —se quedó quieta y el movimiento no la tocó— se mantiene con
 * su última caja como «estimada» hasta `olvidarTrasMs`. Cuando no queda nadie,
 * la numeración vuelve a 1.
 */

import { iou } from "./movimiento";
import { PERSONA_NUEVA_MS, type CajaFraccion, type PersonaEnVivo } from "./vigia";

export interface DeteccionPersona extends CajaFraccion {
  confianza: number;
}

interface Pista {
  id: number;
  caja: CajaFraccion;
  confianza: number;
  primeraVez: number;
  ultimaVez: number;
  vistas: number;
}

export interface Seguimiento {
  pistas: Pista[];
  siguienteId: number;
}

/** Sin verla este tiempo, deja de contar como presente. */
export const OLVIDAR_PERSONA_MS = 8_000;

export function crearSeguimiento(): Seguimiento {
  return { pistas: [], siguienteId: 1 };
}

const centro = (c: CajaFraccion) => [c.x + c.ancho / 2, c.y + c.alto / 2] as const;

/** Qué tan parecidas son (0 = nada): IoU, o centros a menos de 1,5 cajas. */
function cercania(a: CajaFraccion, b: CajaFraccion): number {
  const v = iou(a, b);
  if (v > 0.1) return 1 + v;
  const [ax, ay] = centro(a);
  const [bx, by] = centro(b);
  const d = Math.hypot(ax - bx, ay - by);
  const tope = 1.5 * Math.max(a.ancho, a.alto, b.ancho, b.alto);
  return d < tope ? 1 - d / tope : 0;
}

/**
 * Suma las detecciones de una mirada. Muta `s` y devuelve lo que se dibuja.
 * `vistas` = ids que el detector vio en ESTA mirada (no estimadas).
 */
export function seguir(
  s: Seguimiento,
  detecciones: readonly DeteccionPersona[],
  ahora: number,
  olvidarTrasMs = OLVIDAR_PERSONA_MS,
): PersonaEnVivo[] {
  const libres = new Set(s.pistas.map((_, i) => i));
  const vistas = new Set<number>();
  for (const d of [...detecciones].sort((a, b) => b.confianza - a.confianza)) {
    let mejor = -1;
    let puntaje = 0;
    for (const i of libres) {
      const p = cercania(s.pistas[i].caja, d);
      if (p > puntaje) {
        puntaje = p;
        mejor = i;
      }
    }
    const caja = { x: d.x, y: d.y, ancho: d.ancho, alto: d.alto };
    if (mejor >= 0) {
      libres.delete(mejor);
      const p = s.pistas[mejor];
      p.caja = caja;
      p.confianza = d.confianza;
      p.ultimaVez = ahora;
      p.vistas++;
      vistas.add(p.id);
    } else {
      const p = { id: s.siguienteId++, caja, confianza: d.confianza, primeraVez: ahora, ultimaVez: ahora, vistas: 1 };
      s.pistas.push(p);
      vistas.add(p.id);
    }
  }
  s.pistas = s.pistas.filter((p) => ahora - p.ultimaVez < olvidarTrasMs);
  if (s.pistas.length === 0) s.siguienteId = 1;
  return s.pistas
    .map((p) => ({
      ...p.caja,
      id: p.id,
      confianza: p.confianza,
      vistas: p.vistas,
      nueva: ahora - p.primeraVez < PERSONA_NUEVA_MS,
      estimada: !vistas.has(p.id),
    }))
    .sort((a, b) => a.id - b.id);
}
