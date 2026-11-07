/**
 * loth-mapa-plan — lo que el mapa del Libro TH necesita para mostrar el
 * PLANIFICADOR de extracción (`lib/forestal/loth-planificador.ts`): los tipos
 * de lo que responde `/loth/planificador` y `/loth/geografia`, los colores de
 * cada capa, sus renglones de leyenda y el aviso de la parcela lejos de los
 * árboles. Sin JSX ni Leaflet.
 *
 * Colores: los de la cartografía del plano (`VIA_TIPOS`, `REFERENCIA_TIPOS`),
 * para que una trocha propuesta se vea como se verá cuando se agregue. Como
 * los del resto del mapa, no cambian con el modo oscuro: el mapa tampoco.
 */

import { referenciaMeta, viaMeta } from "@/lib/forestal/loth-cartografia";
import { centroid, pointInPolygon, type LatLng } from "@/lib/forestal/loth-geo";
import type { BaseDelRecuadro, Bbox, LineaGeo } from "@/lib/forestal/loth-geografia";
import type { PropuestaPlan } from "@/lib/forestal/loth-planificador";
import { distanceM } from "@/lib/forestal/loth-utm";
import type { LegendItem } from "./LothMapaChrome";

export const COLOR_PLAN = {
  trocha: viaMeta("trocha").color,
  camino: viaMeta("acceso").color,
  rio: viaMeta("rio").color,
  /** Un camino que YA existe (OpenStreetMap): piedra, para no confundirlo con uno propuesto. */
  caminoOsm: "#57534e",
  acopio: referenciaMeta("acopio").color,
  campamento: referenciaMeta("campamento").color,
  /** Lo que no se puede arrastrar: el rojo del ingreso a la UMF del plano. */
  noApta: referenciaMeta("ingreso").color,
} as const;

export interface FuentesGeografia {
  osm: string | null;
  elevacion: string | null;
}

/** `GET /loth/geografia`, lo que el mapa usa. */
export interface GeografiaVista {
  bbox: Bbox;
  base: BaseDelRecuadro;
  rios: LineaGeo[];
  caminos: LineaGeo[];
  fuentes: FuentesGeografia;
  avisos: string[];
  desdeCache: boolean;
}

export interface ExcluidosPlan {
  motivo: string;
  n: number;
  codigos: string[];
}

/** `GET /loth/planificador`. */
export interface RespuestaPlan {
  planId: string | null;
  propuesta: PropuestaPlan;
  msCalculo: number;
  arboles: { considerados: number; sinCoordenadas: number; excluidos: ExcluidosPlan[] };
  /** Este rol puede guardar en el plano (la misma regla que el PUT de la cartografía). */
  puedeGuardar: boolean;
  geografia: { fuentes: FuentesGeografia; desdeCache: boolean; rios: number; caminos: number } | null;
}

/** Los renglones de la leyenda: sólo lo que está a la vista. */
export function leyendaDelPlan(o: { osm: { rios: readonly unknown[]; caminos: readonly unknown[] } | null; propuesta: PropuestaPlan | null }): LegendItem[] {
  const out: LegendItem[] = [];
  if (o.osm?.rios.length) out.push({ label: "Río o quebrada (OpenStreetMap)", color: COLOR_PLAN.rio, shape: "line" });
  if (o.osm?.caminos.length) out.push({ label: "Camino (OpenStreetMap)", color: COLOR_PLAN.caminoOsm, shape: "line" });
  const p = o.propuesta;
  if (p && !p.vacia) {
    if (p.patios.length) out.push({ label: "Patio de acopio propuesto", color: COLOR_PLAN.acopio, shape: "dot" });
    if (p.campamento) out.push({ label: "Campamento propuesto", color: COLOR_PLAN.campamento, shape: "dot" });
    if (p.trochas.lineas.length) out.push({ label: "Trocha propuesta", color: COLOR_PLAN.trocha, shape: "grid" });
    if (p.caminoSalida) out.push({ label: "Camino de salida propuesto", color: COLOR_PLAN.camino, shape: "grid" });
    if (p.zonasNoAptas.length) out.push({ label: `Muy empinado (más de ${p.parametros.pendienteMaxArrastrePct} %)`, color: COLOR_PLAN.noApta, shape: "poly" });
  }
  return out;
}

/** Hectáreas de las celdas no aptas (cada celda es un rectángulo de la grilla). */
export function haNoAptas(p: PropuestaPlan): number {
  let m2 = 0;
  for (const c of p.zonasNoAptas) {
    const lat = (c.sur + c.norte) / 2;
    m2 += (c.norte - c.sur) * 111_132 * (c.este - c.oeste) * 111_320 * Math.cos((lat * Math.PI) / 180);
  }
  return m2 / 10_000;
}

/**
 * La mayoría de los árboles del censo cae fuera del área dibujada (Blas,
 * 29-09: 65 de 65, a 31 km). Devuelve cuántos, a qué distancia está el área y
 * los puntos para encuadrarlos; null si no es el caso.
 */
export function censoLejosDeLaParcela(censo: readonly { lat: number; lng: number }[], parcela: readonly LatLng[]): { fuera: number; total: number; km: number; puntos: LatLng[] } | null {
  if (parcela.length < 3 || censo.length === 0) return null;
  const pts = censo.map((t): LatLng => [t.lat, t.lng]);
  const ring = [...parcela];
  const fuera = pts.filter((p) => !pointInPolygon(p, ring)).length;
  if (fuera * 2 <= pts.length) return null;
  const a = centroid(ring);
  const b = centroid(pts);
  return { fuera, total: pts.length, km: a && b ? distanceM(a, b) / 1_000 : 0, puntos: pts };
}
