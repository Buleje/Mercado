/**
 * loth-geografia — la GEOGRAFÍA REAL alrededor de la madera: ríos, quebradas y
 * caminos de OpenStreetMap + una grilla de altitud del terreno.
 *
 * Hasta acá el mapa del Libro TH sabía dónde estaba cada árbol, pero no por
 * dónde corre el agua ni por dónde entra un camión: eso lo dibujaba el usuario
 * a mano (y en Blas no había nada dibujado). Con esto el planificador
 * (`loth-planificador.ts`) puede proponer patio, campamento y trochas SEGÚN el
 * terreno, no sobre un papel en blanco.
 *
 * Parte PURA y client-safe: el recuadro de trabajo, la consulta a Overpass, el
 * lector de su respuesta (recorte al recuadro + simplificación a ~5 m) y la
 * grilla de altitud. Las llamadas de red viven en `loth-geografia-fuentes.ts`
 * (servidor: la CSP no deja salir al navegador) y la caché en
 * `ForestLothGeografiaDB`.
 */

import type { LatLng } from "./loth-geo";
import type { LothCartografia } from "./loth-cartografia";
import { distanceM } from "./loth-utm";

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Recuadro geográfico (grados). */
export interface Bbox {
  sur: number;
  oeste: number;
  norte: number;
  este: number;
}

/**
 * Una línea del terreno: un río, una quebrada, un camino. `tipo` es el valor
 * de OpenStreetMap (`river`, `stream`, `unclassified`, `track`…) o el tipo de
 * la vía dibujada en la cartografía (`rio`, `acceso`, `marginal`).
 */
export interface LineaGeo {
  /** Nombre en el mapa; "" si nadie lo puso (en la selva, casi siempre). */
  nombre: string;
  tipo: string;
  puntos: LatLng[];
  origen: "osm" | "dibujo";
  /** Sólo caminos: ¿entra un camión? (una senda o un sendero peatonal no). */
  vehicular?: boolean;
}

/**
 * Altitud del terreno en una grilla regular sobre `bbox`.
 * `valores[fila * nx + col]`: fila 0 = SUR (latitud mínima), col 0 = OESTE.
 * Los nodos caen en las esquinas: col 0 es el borde oeste exacto y col nx−1 el
 * este. `null` = el servicio no dio dato para ese punto.
 */
export interface GrillaElevacion {
  nx: number;
  ny: number;
  bbox: Bbox;
  valores: (number | null)[];
}

/** Qué definió el recuadro: el contorno dibujado, los árboles, o ambos. */
export type BaseDelRecuadro = "predio" | "parcela" | "arboles" | "predio_y_arboles";

export interface GeografiaPredio {
  bbox: Bbox;
  base: BaseDelRecuadro;
  rios: LineaGeo[];
  caminos: LineaGeo[];
  elevacion: GrillaElevacion | null;
  /** ISO de cuándo se obtuvo cada fuente; null = nunca respondió. */
  fuentes: { osm: string | null; elevacion: string | null };
  /**
   * ISO de la última vez que cada servicio FALLÓ (null = anduvo o nunca se
   * pidió). Es la caché negativa: con un fallo reciente no se vuelve a salir a
   * internet hasta que pase la espera o alguien toque «Actualizar».
   */
  fallos?: { osm: string | null; elevacion: string | null };
  avisos: string[];
}

// ─── Constantes ──────────────────────────────────────────────────────────────

/** Margen alrededor del área: un camino a 300 m del lindero también sirve. */
export const MARGEN_RECUADRO_M = 500;
/**
 * Tope por lado. Con 25 nodos por lado la celda sale de 600 m: más grande que
 * eso, la grilla ya no ve una ladera y la consulta a Overpass trae medio
 * departamento.
 */
export const LADO_MAX_KM = 15;
/** Tolerancia de la simplificación: 5 m es menos que el error de un GPS bajo el dosel. */
export const TOLERANCIA_SIMPLIFICAR_M = 5;
/** El modelo de terreno de Open-Meteo (Copernicus 90 m): celdas más finas que 100 m no suman. */
export const CELDA_OBJETIVO_M = 100;
export const GRILLA_MIN_POR_LADO = 5;
export const GRILLA_MAX_POR_LADO = 25;
/** Tope de líneas por capa: un recuadro rural trae decenas, no miles. */
export const MAX_LINEAS_POR_CAPA = 400;

/** `highway` de OSM por donde entra un vehículo de carga (con sus `_link`). */
const CAMINOS_VEHICULARES = new Set([
  "motorway",
  "trunk",
  "primary",
  "secondary",
  "tertiary",
  "unclassified",
  "residential",
  "service",
  "track",
  "road",
  "living_street",
]);

const ETIQUETA_TIPO: Record<string, string> = {
  river: "Río",
  stream: "Quebrada",
  canal: "Canal",
  ditch: "Acequia",
  rio: "Río / quebrada",
  motorway: "Autopista",
  trunk: "Carretera nacional",
  primary: "Carretera",
  secondary: "Carretera",
  tertiary: "Carretera vecinal",
  unclassified: "Camino",
  residential: "Calle",
  service: "Camino de servicio",
  track: "Trocha carrozable",
  road: "Camino",
  path: "Sendero",
  footway: "Sendero",
  acceso: "Vía de acceso",
  marginal: "Vía marginal",
};

/** «Río», «Quebrada Shimbillo», «Camino» — cómo se nombra una línea en una frase. */
export function etiquetaLinea(l: Pick<LineaGeo, "nombre" | "tipo">): string {
  const base = ETIQUETA_TIPO[l.tipo] ?? (l.tipo ? l.tipo[0].toUpperCase() + l.tipo.slice(1) : "Línea");
  if (!l.nombre) return base;
  // «Río Pachitea» ya dice qué es: no se antepone «Río» otra vez.
  return /^(r[ií]o|quebrada|qda\.?|carretera|camino|trocha|v[ií]a|canal)\b/i.test(l.nombre) ? l.nombre : `${base} ${l.nombre}`;
}

// ─── Recuadro ────────────────────────────────────────────────────────────────

const M_POR_GRADO_LAT = 111_132;
const mPorGradoLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

export function bboxDePuntos(puntos: readonly LatLng[]): Bbox | null {
  if (puntos.length === 0) return null;
  let sur = Infinity;
  let norte = -Infinity;
  let oeste = Infinity;
  let este = -Infinity;
  for (const [la, ln] of puntos) {
    if (!Number.isFinite(la) || !Number.isFinite(ln)) continue;
    sur = Math.min(sur, la);
    norte = Math.max(norte, la);
    oeste = Math.min(oeste, ln);
    este = Math.max(este, ln);
  }
  return Number.isFinite(sur) ? { sur, oeste, norte, este } : null;
}

export function unirBbox(a: Bbox, b: Bbox): Bbox {
  return { sur: Math.min(a.sur, b.sur), oeste: Math.min(a.oeste, b.oeste), norte: Math.max(a.norte, b.norte), este: Math.max(a.este, b.este) };
}

export function agrandarBbox(b: Bbox, metros: number): Bbox {
  const latMed = (b.sur + b.norte) / 2;
  const dLat = metros / M_POR_GRADO_LAT;
  const dLng = metros / (mPorGradoLng(latMed) || 1);
  return { sur: b.sur - dLat, oeste: b.oeste - dLng, norte: b.norte + dLat, este: b.este + dLng };
}

/** ¿`a` contiene entero a `b`? */
export function contieneBbox(a: Bbox, b: Bbox): boolean {
  return a.sur <= b.sur && a.oeste <= b.oeste && a.norte >= b.norte && a.este >= b.este;
}

/** Ancho (este-oeste) y alto (norte-sur) en metros. */
export function ladosM(b: Bbox): { anchoM: number; altoM: number } {
  const latMed = (b.sur + b.norte) / 2;
  return {
    anchoM: distanceM([latMed, b.oeste], [latMed, b.este]),
    altoM: distanceM([b.sur, b.oeste], [b.norte, b.oeste]),
  };
}

export const centroBbox = (b: Bbox): LatLng => [(b.sur + b.norte) / 2, (b.oeste + b.este) / 2];

const kmTexto = (m: number) => (m / 1_000).toFixed(1);

export type RecuadroDeTrabajo =
  | { ok: true; bbox: Bbox; base: BaseDelRecuadro; avisos: string[] }
  | { ok: false; motivo: string };

/**
 * El recuadro donde se pide la geografía: el contorno dibujado (predio o
 * parcela) + los árboles del censo, con {@link MARGEN_RECUADRO_M} de margen.
 *
 * Lo decide el SERVIDOR con lo guardado del negocio, nunca un recuadro que
 * mande el navegador: así nadie usa el endpoint como proxy de Overpass.
 *
 * Si el contorno y los árboles están tan lejos que juntos pasan el tope (Blas,
 * 29-09: la parcela dibujada está a ~28 km de sus 61 árboles), manda la zona
 * de los árboles —que es donde se va a trabajar— y se avisa.
 */
export function recuadroDeTrabajo(opts: {
  contorno: readonly LatLng[];
  /** De dónde salió el contorno, para decirlo. */
  contornoEs?: "predio" | "parcela";
  arboles: readonly LatLng[];
}): RecuadroDeTrabajo {
  const que = opts.contornoEs ?? "predio";
  const bp = opts.contorno.length >= 3 ? bboxDePuntos(opts.contorno) : null;
  const bt = bboxDePuntos(opts.arboles);
  const avisos: string[] = [];
  if (!bp && !bt) {
    return {
      ok: false,
      motivo: "No hay área dibujada ni árboles con coordenadas: dibuja el área en el mapa o carga el censo con sus UTM.",
    };
  }

  const tope = LADO_MAX_KM * 1_000;
  const cabe = (b: Bbox) => {
    const { anchoM, altoM } = ladosM(agrandarBbox(b, MARGEN_RECUADRO_M));
    return anchoM <= tope && altoM <= tope;
  };

  let bbox: Bbox;
  let base: BaseDelRecuadro;
  if (bp && bt) {
    const union = unirBbox(bp, bt);
    if (cabe(union)) {
      bbox = union;
      base = contieneBbox(bp, bt) ? que : "predio_y_arboles";
    } else {
      bbox = bt;
      base = "arboles";
      const lejos = distanceM(centroBbox(bp), centroBbox(bt));
      avisos.push(
        `Los árboles del censo están a ${kmTexto(lejos)} km del ${que === "parcela" ? "área dibujada" : "predio dibujado"}: la geografía se pidió alrededor de los árboles. Revisa el contorno o las coordenadas del censo.`,
      );
    }
  } else if (bp) {
    bbox = bp;
    base = que;
    avisos.push("El censo no tiene árboles con coordenadas: la geografía se pidió sobre el contorno dibujado.");
  } else {
    bbox = bt as Bbox;
    base = "arboles";
    avisos.push("No hay predio ni área dibujada: la geografía se pidió alrededor de los árboles del censo.");
  }

  const final = agrandarBbox(bbox, MARGEN_RECUADRO_M);
  const { anchoM, altoM } = ladosM(final);
  if (anchoM > tope || altoM > tope) {
    return {
      ok: false,
      motivo: `El área es demasiado grande (${kmTexto(anchoM)} × ${kmTexto(altoM)} km): el tope es ${LADO_MAX_KM} km por lado. Revisa que el contorno y las coordenadas del censo estén bien.`,
    };
  }
  return { ok: true, bbox: final, base, avisos };
}

// ─── Overpass (OpenStreetMap) ────────────────────────────────────────────────

const f6 = (n: number) => n.toFixed(6);

/** La consulta: ríos/quebradas/canales/acequias y todos los caminos del recuadro. */
export function consultaOverpass(b: Bbox, timeoutS = 25): string {
  const bb = `${f6(b.sur)},${f6(b.oeste)},${f6(b.norte)},${f6(b.este)}`;
  return `[out:json][timeout:${timeoutS}];(way["waterway"~"^(river|stream|canal|ditch)$"](${bb});way["highway"](${bb}););out tags geom;`;
}

/**
 * Recorta una polilínea al recuadro (Liang-Barsky por tramo). Devuelve los
 * pedazos que quedan adentro: un río que sale y vuelve a entrar da dos.
 * Los ríos de OSM son de decenas de km (el de Blas, 826 vértices): sin esto se
 * mandaban enteros.
 */
export function recortarLinea(puntos: readonly LatLng[], b: Bbox): LatLng[][] {
  const out: LatLng[][] = [];
  let actual: LatLng[] = [];
  const cerrar = () => {
    if (actual.length >= 2) out.push(actual);
    actual = [];
  };
  for (let i = 0; i < puntos.length - 1; i++) {
    const seg = recortarTramo(puntos[i], puntos[i + 1], b);
    if (!seg) {
      cerrar();
      continue;
    }
    const [a, c, entraCortado, saleCortado] = seg;
    if (entraCortado || actual.length === 0) {
      cerrar();
      actual = [a];
    }
    actual.push(c);
    if (saleCortado) cerrar();
  }
  cerrar();
  return out;
}

/** [inicio, fin, ¿el inicio fue recortado?, ¿el fin fue recortado?] o null si no toca el recuadro. */
function recortarTramo(p: LatLng, q: LatLng, b: Bbox): [LatLng, LatLng, boolean, boolean] | null {
  const [y0, x0] = p;
  const [y1, x1] = q;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;
  const pruebas: [number, number][] = [
    [-dx, x0 - b.oeste],
    [dx, b.este - x0],
    [-dy, y0 - b.sur],
    [dy, b.norte - y0],
  ];
  for (const [pp, qq] of pruebas) {
    if (pp === 0) {
      if (qq < 0) return null;
      continue;
    }
    const r = qq / pp;
    if (pp < 0) {
      if (r > t1) return null;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return null;
      if (r < t1) t1 = r;
    }
  }
  return [[y0 + t0 * dy, x0 + t0 * dx], [y0 + t1 * dy, x0 + t1 * dx], t0 > 0, t1 < 1];
}

/**
 * Douglas-Peucker en metros locales. Mantiene los extremos; saca los vértices
 * que se apartan menos de `toleranciaM` de la cuerda.
 */
export function simplificarLinea(puntos: readonly LatLng[], toleranciaM = TOLERANCIA_SIMPLIFICAR_M): LatLng[] {
  if (puntos.length <= 2) return [...puntos];
  const lat0 = puntos[0][0];
  const mx = mPorGradoLng(lat0) || 1;
  const xy = puntos.map(([la, ln]) => [(ln - puntos[0][1]) * mx, (la - lat0) * M_POR_GRADO_LAT] as const);
  const guardar = new Uint8Array(puntos.length);
  guardar[0] = 1;
  guardar[puntos.length - 1] = 1;
  const pila: [number, number][] = [[0, puntos.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop() as [number, number];
    const [ax, ay] = xy[i];
    const [bx, by] = xy[j];
    const vx = bx - ax;
    const vy = by - ay;
    const len2 = vx * vx + vy * vy;
    let maxD = -1;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const [px, py] = xy[k];
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
      const d = Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (idx >= 0 && maxD > toleranciaM) {
      guardar[idx] = 1;
      pila.push([i, idx], [idx, j]);
    }
  }
  return puntos.filter((_, k) => guardar[k] === 1);
}

interface ElementoOverpass {
  type?: unknown;
  tags?: Record<string, unknown>;
  geometry?: unknown;
}

/**
 * Lee la respuesta de Overpass. Devuelve `null` —no listas vacías— cuando la
 * respuesta no es la de una consulta que terminó bien: HTML de «too busy», un
 * JSON con `remark` de error o de tiempo agotado. Un null dice «no sé»; unas
 * listas vacías dirían «no hay ríos», y eso sería mentir.
 */
export function parsearOverpass(texto: string, bbox: Bbox): { rios: LineaGeo[]; caminos: LineaGeo[] } | null {
  let data: unknown;
  try {
    data = JSON.parse(texto);
  } catch {
    return null;
  }
  const d = data as { elements?: unknown; remark?: unknown } | null;
  if (!d || typeof d !== "object" || !Array.isArray(d.elements)) return null;
  if (typeof d.remark === "string" && /error|timed out|timeout|out of memory|too busy/i.test(d.remark)) return null;

  const rios: LineaGeo[] = [];
  const caminos: LineaGeo[] = [];
  for (const raw of d.elements as ElementoOverpass[]) {
    if (!raw || raw.type !== "way" || !Array.isArray(raw.geometry)) continue;
    const tags = raw.tags ?? {};
    const waterway = typeof tags.waterway === "string" ? tags.waterway : null;
    const highway = typeof tags.highway === "string" ? tags.highway : null;
    if (!waterway && !highway) continue;
    const pts: LatLng[] = [];
    for (const g of raw.geometry as { lat?: unknown; lon?: unknown }[]) {
      const la = Number(g?.lat);
      const ln = Number(g?.lon);
      if (Number.isFinite(la) && Number.isFinite(ln)) pts.push([la, ln]);
    }
    const nombre = typeof tags.name === "string" ? tags.name.trim().slice(0, 80) : "";
    for (const pedazo of recortarLinea(pts, bbox)) {
      const puntos = simplificarLinea(pedazo);
      if (puntos.length < 2) continue;
      if (waterway) {
        if (rios.length < MAX_LINEAS_POR_CAPA) rios.push({ nombre, tipo: waterway, puntos, origen: "osm" });
      } else if (highway && caminos.length < MAX_LINEAS_POR_CAPA) {
        caminos.push({ nombre, tipo: highway, puntos, origen: "osm", vehicular: CAMINOS_VEHICULARES.has(highway.replace(/_link$/, "")) });
      }
    }
  }
  return { rios, caminos };
}

// ─── Lo dibujado a mano ──────────────────────────────────────────────────────

/** Prefijo de los ids que pone el planificador: lo propuesto se reemplaza, lo dibujado no se toca. */
export const PREFIJO_PROPUESTA = "prop-";

/**
 * Ríos y caminos que el usuario dibujó en la cartografía. Lo que propuso el
 * planificador antes (ids `prop-…`) NO cuenta como camino existente: si no, la
 * segunda corrida conectaría el patio a su propia propuesta.
 */
export function lineasDeCartografia(carto: Pick<LothCartografia, "vias">): { rios: LineaGeo[]; caminos: LineaGeo[] } {
  const rios: LineaGeo[] = [];
  const caminos: LineaGeo[] = [];
  for (const v of carto.vias) {
    if (v.id.startsWith(PREFIJO_PROPUESTA) || v.puntos.length < 2) continue;
    if (v.tipo === "rio") rios.push({ nombre: v.nombre, tipo: "rio", puntos: v.puntos, origen: "dibujo" });
    else if (v.tipo === "acceso" || v.tipo === "marginal") caminos.push({ nombre: v.nombre, tipo: v.tipo, puntos: v.puntos, origen: "dibujo", vehicular: true });
  }
  return { rios, caminos };
}

// ─── Grilla de altitud ───────────────────────────────────────────────────────

/** Nodos por lado: una celda de ~100 m, entre 5 y 25 por lado. */
export function dimensionGrilla(b: Bbox): { nx: number; ny: number } {
  const { anchoM, altoM } = ladosM(b);
  const n = (m: number) => Math.max(GRILLA_MIN_POR_LADO, Math.min(GRILLA_MAX_POR_LADO, Math.ceil(m / CELDA_OBJETIVO_M) + 1));
  return { nx: n(anchoM), ny: n(altoM) };
}

/** Los puntos a consultar, en el orden de `valores` (fila 0 = sur, col 0 = oeste). */
export function puntosDeGrilla(b: Bbox, nx: number, ny: number): LatLng[] {
  const out: LatLng[] = [];
  for (let fila = 0; fila < ny; fila++) {
    const lat = ny === 1 ? b.sur : b.sur + ((b.norte - b.sur) * fila) / (ny - 1);
    for (let col = 0; col < nx; col++) {
      const lng = nx === 1 ? b.oeste : b.oeste + ((b.este - b.oeste) * col) / (nx - 1);
      out.push([lat, lng]);
    }
  }
  return out;
}

/**
 * Altitud en un punto por interpolación bilineal. `null` fuera de la grilla o
 * si falta una de las cuatro esquinas: una altitud inventada daría pendientes
 * falsas.
 */
export function elevacionEn(g: GrillaElevacion, p: LatLng): number | null {
  const { nx, ny, bbox: b, valores } = g;
  if (nx < 2 || ny < 2) return null;
  const fx = ((p[1] - b.oeste) / (b.este - b.oeste)) * (nx - 1);
  const fy = ((p[0] - b.sur) / (b.norte - b.sur)) * (ny - 1);
  const eps = 1e-9;
  if (!(fx >= -eps && fx <= nx - 1 + eps && fy >= -eps && fy <= ny - 1 + eps)) return null;
  const c0 = Math.min(nx - 2, Math.max(0, Math.floor(fx)));
  const f0 = Math.min(ny - 2, Math.max(0, Math.floor(fy)));
  const tx = Math.min(1, Math.max(0, fx - c0));
  const ty = Math.min(1, Math.max(0, fy - f0));
  const z00 = valores[f0 * nx + c0];
  const z10 = valores[f0 * nx + c0 + 1];
  const z01 = valores[(f0 + 1) * nx + c0];
  const z11 = valores[(f0 + 1) * nx + c0 + 1];
  if (z00 == null || z10 == null || z01 == null || z11 == null) return null;
  return z00 * (1 - tx) * (1 - ty) + z10 * tx * (1 - ty) + z01 * (1 - tx) * ty + z11 * tx * ty;
}

/** Arma la grilla con lo que devolvió el servicio; `null` si no alcanza para una celda. */
export function armarGrilla(b: Bbox, nx: number, ny: number, valores: readonly (number | null)[]): GrillaElevacion | null {
  if (valores.length !== nx * ny) return null;
  const limpios = valores.map((v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null));
  if (limpios.filter((v) => v != null).length < 4) return null;
  return { nx, ny, bbox: b, valores: limpios };
}

/** Resumen corto del relieve: «de 212 a 298 m». */
export function rangoDeAltitud(g: GrillaElevacion | null): { minM: number; maxM: number } | null {
  if (!g) return null;
  const vs = g.valores.filter((v): v is number => v != null);
  if (vs.length === 0) return null;
  return { minM: Math.min(...vs), maxM: Math.max(...vs) };
}

// ─── Lo guardado ─────────────────────────────────────────────────────────────

const esBbox = (v: unknown): v is Bbox => {
  const b = v as Record<string, unknown> | null;
  return (
    !!b &&
    ["sur", "oeste", "norte", "este"].every((k) => typeof b[k] === "number" && Number.isFinite(b[k] as number)) &&
    (b.sur as number) < (b.norte as number) &&
    (b.oeste as number) < (b.este as number)
  );
};

function normalizarLineas(raw: unknown): LineaGeo[] {
  if (!Array.isArray(raw)) return [];
  const out: LineaGeo[] = [];
  for (const l of raw.slice(0, MAX_LINEAS_POR_CAPA)) {
    const o = (l ?? {}) as Record<string, unknown>;
    const puntos: LatLng[] = [];
    for (const p of Array.isArray(o.puntos) ? o.puntos : []) {
      const par = p as unknown[];
      const la = Number(par?.[0]);
      const ln = Number(par?.[1]);
      if (Number.isFinite(la) && Number.isFinite(ln)) puntos.push([la, ln]);
    }
    if (puntos.length < 2) continue;
    out.push({
      nombre: typeof o.nombre === "string" ? o.nombre.slice(0, 80) : "",
      tipo: typeof o.tipo === "string" ? o.tipo.slice(0, 30) : "",
      puntos,
      origen: o.origen === "dibujo" ? "dibujo" : "osm",
      ...(typeof o.vehicular === "boolean" ? { vehicular: o.vehicular } : {}),
    });
  }
  return out;
}

/**
 * Lee la geografía guardada en el KV. Tolerante: lo que no tiene forma se
 * descarta (una caché rota no puede tumbar el mapa); sin recuadro, null.
 */
export function normalizarGeografia(raw: unknown): GeografiaPredio | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  if (!esBbox(o.bbox)) return null;
  const f = (o.fuentes ?? {}) as Record<string, unknown>;
  const fa = (o.fallos ?? {}) as Record<string, unknown>;
  let elevacion: GrillaElevacion | null = null;
  const g = o.elevacion as Record<string, unknown> | null | undefined;
  if (g && esBbox(g.bbox) && Number.isInteger(g.nx) && Number.isInteger(g.ny) && Array.isArray(g.valores)) {
    elevacion = armarGrilla(g.bbox, g.nx as number, g.ny as number, (g.valores as unknown[]).map((v) => (typeof v === "number" ? v : null)));
  }
  const bases: BaseDelRecuadro[] = ["predio", "parcela", "arboles", "predio_y_arboles"];
  return {
    bbox: o.bbox,
    base: bases.includes(o.base as BaseDelRecuadro) ? (o.base as BaseDelRecuadro) : "predio",
    rios: normalizarLineas(o.rios),
    caminos: normalizarLineas(o.caminos),
    elevacion,
    fuentes: {
      osm: typeof f.osm === "string" ? f.osm : null,
      elevacion: typeof f.elevacion === "string" ? f.elevacion : null,
    },
    fallos: {
      osm: typeof fa.osm === "string" ? fa.osm : null,
      elevacion: typeof fa.elevacion === "string" ? fa.elevacion : null,
    },
    avisos: [],
  };
}
