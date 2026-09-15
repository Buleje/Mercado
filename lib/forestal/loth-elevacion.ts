/**
 * loth-elevacion — PERFIL DE TERRENO de una traza (camino, trocha de arrastre,
 * cauce) para responder algo que en el monte decide el costo: **¿por dónde se
 * saca la madera?**
 *
 * Una trocha con 35% de pendiente no la sube un tractor forestal cargado; una
 * quebrada encajonada obliga a otro punto de cruce. Hasta acá el mapa mostraba
 * la planta, nunca el relieve.
 *
 * Parte pura: muestreo de la traza, cálculo de pendientes y armado del perfil.
 * Los datos de altitud los trae `/api/admin/forestal/loth/elevacion` (proxy de
 * Open-Meteo, que no está en el `connect-src` de la CSP).
 */

import { csrfHeaders } from "@/lib/csrf-client";
import type { LatLng } from "./loth-geo";
import { distanceM, lineLengthM } from "./loth-utm";

/** Tope de puntos por consulta (Open-Meteo acepta 100). */
export const MAX_MUESTRAS = 100;

/** Pendiente a partir de la cual el arrastre mecanizado deja de ser viable. */
export const PENDIENTE_CRITICA_PCT = 30;

export interface PuntoPerfil {
  /** Distancia acumulada desde el inicio (m). */
  distanciaM: number;
  elevacionM: number;
  /** Pendiente del tramo que llega a este punto (%; + sube, − baja). */
  pendientePct: number;
  punto: LatLng;
}

export interface PerfilElevacion {
  puntos: PuntoPerfil[];
  largoM: number;
  elevMinM: number;
  elevMaxM: number;
  desnivelM: number;
  /** Suma de los tramos que suben (lo que hay que "ganar" en total). */
  ascensoM: number;
  descensoM: number;
  pendienteMediaPct: number;
  pendienteMaxPct: number;
  /** Metros de traza que superan la pendiente crítica. */
  largoCriticoM: number;
  advertencia: string | null;
}

const round = (n: number, d = 2): number => Number(n.toFixed(d));

/**
 * Reparte `n` puntos equidistantes sobre la traza (incluye extremos). Es lo que
 * se manda a consultar: pedir vértice por vértice daría un perfil con huecos en
 * los tramos largos.
 */
export function muestrearTraza(traza: LatLng[], n = 60): LatLng[] {
  if (traza.length === 0) return [];
  if (traza.length === 1) return [traza[0]];
  const total = lineLengthM(traza);
  const cantidad = Math.max(2, Math.min(MAX_MUESTRAS, Math.floor(n)));
  if (total === 0) return [traza[0], traza[traza.length - 1]];

  // Longitud acumulada de cada vértice, para interpolar dentro del segmento.
  const acum: number[] = [0];
  for (let i = 1; i < traza.length; i++) acum.push(acum[i - 1] + distanceM(traza[i - 1], traza[i]));

  const out: LatLng[] = [];
  for (let k = 0; k < cantidad; k++) {
    const objetivo = (total * k) / (cantidad - 1);
    let i = 1;
    while (i < acum.length - 1 && acum[i] < objetivo) i++;
    const largoSeg = acum[i] - acum[i - 1];
    const t = largoSeg === 0 ? 0 : (objetivo - acum[i - 1]) / largoSeg;
    const a = traza[i - 1];
    const b = traza[i];
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/**
 * Une las muestras con sus elevaciones y saca las métricas del perfil.
 * Si faltan elevaciones (el servicio devolvió menos), se corta al mínimo común:
 * mejor un perfil más corto que uno desalineado.
 */
export function construirPerfil(muestras: LatLng[], elevaciones: number[]): PerfilElevacion {
  const n = Math.min(muestras.length, elevaciones.length);
  const vacio: PerfilElevacion = {
    puntos: [],
    largoM: 0,
    elevMinM: 0,
    elevMaxM: 0,
    desnivelM: 0,
    ascensoM: 0,
    descensoM: 0,
    pendienteMediaPct: 0,
    pendienteMaxPct: 0,
    largoCriticoM: 0,
    advertencia: null,
  };
  if (n < 2) return vacio;

  const puntos: PuntoPerfil[] = [];
  let acumulado = 0;
  let ascenso = 0;
  let descenso = 0;
  let pendienteMax = 0;
  let largoCritico = 0;

  for (let i = 0; i < n; i++) {
    const elev = Number(elevaciones[i]);
    if (!Number.isFinite(elev)) continue;
    let pendiente = 0;
    if (i > 0) {
      const tramo = distanceM(muestras[i - 1], muestras[i]);
      acumulado += tramo;
      const dz = elev - puntos[puntos.length - 1].elevacionM;
      pendiente = tramo > 0 ? (dz / tramo) * 100 : 0;
      if (dz > 0) ascenso += dz;
      else descenso += -dz;
      if (Math.abs(pendiente) > Math.abs(pendienteMax)) pendienteMax = pendiente;
      if (Math.abs(pendiente) >= PENDIENTE_CRITICA_PCT) largoCritico += tramo;
    }
    puntos.push({ distanciaM: round(acumulado), elevacionM: round(elev, 1), pendientePct: round(pendiente, 1), punto: muestras[i] });
  }
  if (puntos.length < 2) return vacio;

  const elevs = puntos.map((p) => p.elevacionM);
  const elevMinM = Math.min(...elevs);
  const elevMaxM = Math.max(...elevs);
  const largoM = round(acumulado);
  const desnivelM = round(elevMaxM - elevMinM, 1);
  const pendienteMediaPct = largoM > 0 ? round(((puntos[puntos.length - 1].elevacionM - puntos[0].elevacionM) / largoM) * 100, 1) : 0;

  const advertencia =
    largoCritico > 0
      ? `${Math.round(largoCritico)} m de la traza superan el ${PENDIENTE_CRITICA_PCT}% de pendiente: el arrastre mecanizado ahí no es viable y hay riesgo de erosión.`
      : null;

  return {
    puntos,
    largoM,
    elevMinM,
    elevMaxM,
    desnivelM,
    ascensoM: round(ascenso, 1),
    descensoM: round(descenso, 1),
    pendienteMediaPct,
    pendienteMaxPct: round(pendienteMax, 1),
    largoCriticoM: round(largoCritico),
    advertencia,
  };
}

/** Path SVG del perfil, normalizado a un lienzo `w × h`. */
export function perfilToSvgPath(perfil: PerfilElevacion, w: number, h: number, pad = 4): string {
  if (perfil.puntos.length < 2 || perfil.largoM === 0) return "";
  const rango = Math.max(1, perfil.elevMaxM - perfil.elevMinM);
  return perfil.puntos
    .map((p, i) => {
      const x = pad + (p.distanciaM / perfil.largoM) * (w - pad * 2);
      const y = h - pad - ((p.elevacionM - perfil.elevMinM) / rango) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/** Pide las elevaciones por nuestro proxy. Devuelve [] si el servicio falla. */
export async function cargarElevaciones(puntos: LatLng[], signal?: AbortSignal): Promise<number[]> {
  if (puntos.length === 0) return [];
  try {
    const res = await fetch("/api/admin/forestal/loth/elevacion", {
      method: "POST",
      // POST sin token CSRF = 403 del middleware: el endpoint responde igual por
      // curl y falla desde el navegador, que fue justo lo que pasó al probarlo.
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      credentials: "include",
      body: JSON.stringify({ puntos: puntos.slice(0, MAX_MUESTRAS) }),
      signal,
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { elevaciones?: number[] };
    return Array.isArray(data.elevaciones) ? data.elevaciones : [];
  } catch {
    return [];
  }
}
