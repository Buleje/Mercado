/**
 * loth-planificador-piezas — cada decisión del planificador por separado:
 * dónde va el patio, cómo se arma la red de trochas, por dónde sale el
 * camión, dónde va el campamento y qué celdas son demasiado empinadas. PURO.
 * Las orquesta `planificarExtraccion` (`loth-planificador.ts`).
 */

import { pointInPolygon, type LatLng } from "./loth-geo";
import { bearingDeg, lineLengthM } from "./loth-utm";
import { rumboCardinal, textoDistancia } from "./loth-mapa-arboles";
import { agrandarBbox, bboxDePuntos, etiquetaLinea, ladosM, type Bbox, type GrillaElevacion, type LineaGeo } from "./loth-geografia";
import type { CampamentoPropuesto, CaminoSalida, CeldaNoApta, ParametrosPlan } from "./loth-planificador";
import {
  aLL,
  aXY,
  claseDeAgua,
  distPuntoSeg,
  IndiceSegmentos,
  Monticulo,
  plural,
  pct,
  r0,
  r1,
  Relieve,
  type Plano,
  type Seg,
} from "./loth-planificador-terreno";



/** Celdas de la grilla con pendiente media mayor que `maxPct`, en lat/lng para pintarlas. */
export function celdasEmpinadas(g: GrillaElevacion | null, maxPct: number): CeldaNoApta[] {
  if (!g || g.nx < 2 || g.ny < 2) return [];
  const { anchoM, altoM } = ladosM(g.bbox);
  const dx = anchoM / (g.nx - 1);
  const dy = altoM / (g.ny - 1);
  const dLng = (g.bbox.este - g.bbox.oeste) / (g.nx - 1);
  const dLat = (g.bbox.norte - g.bbox.sur) / (g.ny - 1);
  const out: CeldaNoApta[] = [];
  for (let f = 0; f < g.ny - 1; f++) {
    for (let c = 0; c < g.nx - 1; c++) {
      const z00 = g.valores[f * g.nx + c];
      const z10 = g.valores[f * g.nx + c + 1];
      const z01 = g.valores[(f + 1) * g.nx + c];
      const z11 = g.valores[(f + 1) * g.nx + c + 1];
      if (z00 == null || z10 == null || z01 == null || z11 == null) continue;
      const gx = (z10 + z11 - z00 - z01) / (2 * dx);
      const gy = (z01 + z11 - z00 - z10) / (2 * dy);
      const p = Math.hypot(gx, gy) * 100;
      if (p > maxPct) {
        const sur = g.bbox.sur + f * dLat;
        const oeste = g.bbox.oeste + c * dLng;
        out.push({ sur, oeste, norte: sur + dLat, este: oeste + dLng, pendientePct: r1(p) });
      }
    }
  }
  return out;
}

export type AguaCerca = (x: number, y: number, radio: number) => { d: number; linea: number; faja: number } | null;
export type EnFaja = (x: number, y: number, holguraM?: number) => { d: number; linea: number; faja: number } | null;

/**
 * Candidatos en grilla dentro de la zona; fuera los de la faja y los empinados;
 * gana el menor Σ(m³ × distancia) + camino a abrir. Tres, separados.
 */
export function buscarPatios(
  zona: LatLng[],
  pl: Plano,
  P: ParametrosPlan,
  relieve: Relieve,
  enFaja: EnFaja,
  evaluar: (x: number, y: number) => { puntaje: number },
): { elegidos: { x: number; y: number; puntaje: number }[]; relajado: boolean; descartes: { faja: number; pendiente: number; probados: number } } {
  const bb = bboxDePuntos(zona);
  if (!bb) return { elegidos: [], relajado: false, descartes: { faja: 0, pendiente: 0, probados: 0 } };
  const { anchoM, altoM } = ladosM(bb);
  // ~2 500 candidatos: 25 m en un área chica, más espaciados en una grande.
  const paso = Math.max(25, Math.sqrt((anchoM * altoM) / 2_500));
  const [x0, y0] = aXY(pl, [bb.sur, bb.oeste]);
  const [x1, y1] = aXY(pl, [bb.norte, bb.este]);
  const validos: { x: number; y: number; puntaje: number; pend: number | null }[] = [];
  const empinados: { x: number; y: number; puntaje: number; pend: number }[] = [];
  const descartes = { faja: 0, pendiente: 0, probados: 0 };
  for (let y = y0 + paso / 2; y <= y1; y += paso) {
    for (let x = x0 + paso / 2; x <= x1; x += paso) {
      if (!pointInPolygon(aLL(pl, x, y), zona)) continue;
      descartes.probados++;
      if (enFaja(x, y)) {
        descartes.faja++;
        continue;
      }
      const pend = relieve.pendiente(x, y);
      const { puntaje } = evaluar(x, y);
      if (pend != null && pend > P.pendienteMaxPatioPct) {
        descartes.pendiente++;
        empinados.push({ x, y, puntaje, pend });
        continue;
      }
      validos.push({ x, y, puntaje, pend });
    }
  }
  let relajado = false;
  let pool: { x: number; y: number; puntaje: number }[] = validos;
  if (pool.length === 0 && empinados.length) {
    // Todo es ladera: el menos empinado del cuartil más barato.
    relajado = true;
    empinados.sort((a, b) => a.pend - b.pend || a.puntaje - b.puntaje);
    pool = empinados.slice(0, Math.max(1, Math.ceil(empinados.length / 4)));
  }
  pool = [...pool].sort((a, b) => a.puntaje - b.puntaje || a.y - b.y || a.x - b.x);
  const elegidos: { x: number; y: number; puntaje: number }[] = [];
  for (const c of pool) {
    if (elegidos.every((e) => Math.hypot(e.x - c.x, e.y - c.y) >= P.separacionPatiosM)) elegidos.push(c);
    if (elegidos.length === 3) break;
  }
  return { elegidos, relajado, descartes };
}

/**
 * La red de trochas: un árbol que une el patio con cada árbol, armado con
 * Prim-Dijkstra (Alpert et al.). Cada árbol se cuelga del nodo que minimiza
 * `alfa × (costo de la red hasta ese nodo) + costo del tramo`:
 *   · alfa = 0 → árbol de expansión mínima: la MENOR cantidad de trocha, pero
 *     la madera da vueltas (en Blas, arrastre medio 825 m contra 546 en recta:
 *     la trocha serpentea de árbol en árbol);
 *   · alfa = 1 → cada árbol por su camino más corto: arrastre mínimo, trocha
 *     de más.
 * Costo de un tramo = largo ponderado por la pendiente + penalidad por cada
 * cruce de agua. Hasta 150 nodos se prueban todos los pares; con más, los 10
 * vecinos más cercanos de cada uno (y si quedan grupos sueltos, se unen por el
 * par más cercano).
 */
export function armarRed(
  px: number,
  py: number,
  txy: [number, number][],
  relieve: Relieve,
  agua: IndiceSegmentos,
  P: ParametrosPlan,
  /** Semilleros como segmentos de largo 0 (`linea` = su índice): una trocha no les pasa encima. */
  semilleros: IndiceSegmentos,
): { a: number; b: number; costo: number; pendMax: number | null; cruces: number; semilleros: number[] }[] {
  const pts: [number, number][] = [[px, py], ...txy];
  const n = pts.length;
  const alfa = Math.max(0, Math.min(1, P.alfaArrastre));

  // Vecinos candidatos de cada nodo.
  const vecinos: number[][] = Array.from({ length: n }, () => []);
  if (n <= 150) {
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) vecinos[a].push(b);
  } else {
    // Los K más cercanos por inserción en una lista corta: O(n²·K), sin ordenar n listas.
    const K = 10;
    const conj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
    for (let a = 0; a < n; a++) {
      const dist: number[] = [];
      const idx: number[] = [];
      for (let b = 0; b < n; b++) {
        if (b === a) continue;
        const d = Math.hypot(pts[a][0] - pts[b][0], pts[a][1] - pts[b][1]);
        if (dist.length === K && d >= dist[K - 1]) continue;
        let i = dist.length === K ? K - 1 : dist.length;
        if (dist.length < K) {
          dist.push(d);
          idx.push(b);
        }
        while (i > 0 && dist[i - 1] > d) {
          dist[i] = dist[i - 1];
          idx[i] = idx[i - 1];
          i--;
        }
        dist[i] = d;
        idx[i] = b;
      }
      // Simétrico: si b es vecino de a, a es vecino de b.
      for (const b of idx) {
        conj[a].add(b);
        conj[b].add(a);
      }
    }
    for (let a = 0; a < n; a++) vecinos[a] = [...conj[a]].sort((u, v) => u - v);
  }

  const cache = new Map<number, { costo: number; pendMax: number | null; cruces: number; semilleros: number[] }>();
  const tramo = (a: number, b: number) => {
    const k = a < b ? a * n + b : b * n + a;
    let t = cache.get(k);
    if (!t) {
      const [ax, ay] = pts[a];
      const [bx, by] = pts[b];
      const r = relieve.tramo(ax, ay, bx, by);
      const cruces = agua.cruces(ax, ay, bx, by);
      // Semilleros a menos de `distMinSemilleroM` del tramo: arrastrar ahí los lastima (Blas 29-09: una trocha a 2 m del 19).
      const d = P.distMinSemilleroM;
      const cerca = semilleros
        .enCaja(Math.min(ax, bx) - d, Math.min(ay, by) - d, Math.max(ax, bx) + d, Math.max(ay, by) + d)
        .filter((k) => distPuntoSeg(semilleros.segs[k].ax, semilleros.segs[k].ay, ax, ay, bx, by) <= d)
        .map((k) => semilleros.segs[k].linea);
      t = { costo: r.costo + cruces * P.penalidadCruceM + cerca.length * P.penalidadSemilleroM, pendMax: r.pendMax, cruces, semilleros: cerca };
      cache.set(k, t);
    }
    return t;
  };

  const enRed = new Uint8Array(n);
  const costoRed = new Float64Array(n);
  const red: { a: number; b: number; costo: number; pendMax: number | null; cruces: number; semilleros: number[] }[] = [];
  const heap = new Monticulo();
  // El montículo guarda (clave, nodo·n + padre): un solo número por entrada.
  // Cruzar agua va DESPUÉS de todo lo seco: una entrada con cruce lleva
  // `SECO_PRIMERO` encima y sólo sale cuando no queda forma seca de llegar a
  // nadie. Sin esto, el término de arrastre (alfa) hacía cruzar el mismo río
  // dos veces para acortar el arrastre de un grupo. Pero tampoco una vuelta
  // absurda: si llegar en seco a un árbol cuesta más de `vueltaMaxSinCruzarM`
  // por sobre su mejor cruce, se cruza.
  const SECO_PRIMERO = 1e12;
  const mejorCruce = new Float64Array(n).fill(Infinity);
  const padreCruce = new Int32Array(n).fill(-1);
  const empujarVecinos = (u: number) => {
    for (const v of vecinos[u]) {
      if (enRed[v]) continue;
      const t = tramo(u, v);
      const clave = alfa * costoRed[u] + t.costo;
      if (t.cruces > 0) {
        heap.push(SECO_PRIMERO + clave, v * n + u);
        if (clave < mejorCruce[v]) {
          mejorCruce[v] = clave;
          padreCruce[v] = u;
        }
      } else {
        heap.push(clave, v * n + u);
      }
    }
  };
  const sumar = (v: number, u: number) => {
    const t = tramo(u, v);
    enRed[v] = 1;
    costoRed[v] = costoRed[u] + t.costo;
    red.push({ a: u, b: v, costo: t.costo, pendMax: t.pendMax, cruces: t.cruces, semilleros: t.semilleros });
    empujarVecinos(v);
  };
  enRed[0] = 1;
  empujarVecinos(0);
  while (red.length < n - 1) {
    while (!heap.vacio) {
      const [clave, cod] = heap.pop();
      const v = Math.floor(cod / n);
      const u = cod % n;
      if (enRed[v]) continue;
      const vueltaDemasiado = clave < SECO_PRIMERO && padreCruce[v] >= 0 && clave - mejorCruce[v] > P.vueltaMaxSinCruzarM;
      sumar(v, vueltaDemasiado ? padreCruce[v] : u);
    }
    if (red.length >= n - 1) break;
    // Grupo suelto (sólo con vecinos): el par más cercano entre la red y lo que falta.
    let mejor: [number, number, number] | null = null;
    for (let u = 0; u < n; u++) {
      if (!enRed[u]) continue;
      for (let v = 0; v < n; v++) {
        if (enRed[v]) continue;
        const d = Math.hypot(pts[u][0] - pts[v][0], pts[u][1] - pts[v][1]);
        if (!mejor || d < mejor[2]) mejor = [u, v, d];
      }
    }
    if (!mejor) break;
    sumar(mejor[1], mejor[0]);
  }
  return red;
}

/**
 * Camino de salida: el recorrido de menor costo por una grilla de ~40 000
 * celdas, del patio a la celda más barata que toca un camino. Evita laderas
 * ((pend/15)² como en las trochas) y cruces de agua (penalidad por cruce).
 */
export function trazarSalida(
  px: number,
  py: number,
  pl: Plano,
  relieve: Relieve,
  agua: IndiceSegmentos,
  segCamino: Seg[],
  caminos: readonly LineaGeo[],
  bboxGeo: Bbox | null,
  zona: LatLng[],
  P: ParametrosPlan,
): CaminoSalida | null {
  const patioLL = aLL(pl, px, py);
  const base = bboxGeo ?? agrandarBbox(bboxDePuntos([...zona, patioLL]) as Bbox, 1_000);
  const bb = {
    sur: Math.min(base.sur, patioLL[0]),
    oeste: Math.min(base.oeste, patioLL[1]),
    norte: Math.max(base.norte, patioLL[0]),
    este: Math.max(base.este, patioLL[1]),
  };
  const [x0, y0] = aXY(pl, [bb.sur, bb.oeste]);
  const [x1, y1] = aXY(pl, [bb.norte, bb.este]);
  const res = Math.max(25, Math.sqrt(((x1 - x0) * (y1 - y0)) / 40_000));
  const W = Math.max(2, Math.ceil((x1 - x0) / res) + 1);
  const H = Math.max(2, Math.ceil((y1 - y0) / res) + 1);
  const cx = (i: number) => x0 + i * res;
  const cy = (j: number) => y0 + j * res;

  // Índice de caminos para marcar las celdas destino.
  const idxCam = new IndiceSegmentos(Math.max(100, res * 2));
  for (const s of segCamino) idxCam.agregar(s);
  const umbral = res * 0.75;
  const esAgua = new Uint8Array(W * H);
  const destino = new Int32Array(W * H).fill(-1);
  const z = new Float64Array(W * H);
  const zOk = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const x = cx(i);
      const y = cy(j);
      if (agua.masCercano(x, y, umbral)) esAgua[k] = 1;
      const c = idxCam.masCercano(x, y, umbral);
      if (c) destino[k] = c.linea;
      const zz = relieve.z(x, y);
      if (zz != null) {
        z[k] = zz;
        zOk[k] = 1;
      }
    }
  }
  const si = Math.min(W - 1, Math.max(0, Math.round((px - x0) / res)));
  const sj = Math.min(H - 1, Math.max(0, Math.round((py - y0) / res)));
  const inicio = sj * W + si;

  const costo = new Float64Array(W * H).fill(Infinity);
  const previo = new Int32Array(W * H).fill(-1);
  costo[inicio] = 0;
  const heap = new Monticulo();
  heap.push(0, inicio);
  let llegada = -1;
  const vecinos = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  while (!heap.vacio) {
    const [c, k] = heap.pop();
    if (c > costo[k]) continue;
    if (destino[k] >= 0) {
      llegada = k;
      break;
    }
    const i = k % W;
    const j = (k - i) / W;
    for (const [di, dj] of vecinos) {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
      const nk = nj * W + ni;
      const d = res * (di && dj ? Math.SQRT2 : 1);
      const p = zOk[k] && zOk[nk] ? (Math.abs(z[nk] - z[k]) / d) * 100 : 0;
      const nc = c + d * (1 + (p / P.pendienteMaxCaminoPct) ** 2) + (esAgua[nk] && !esAgua[k] ? P.penalidadCruceM : 0);
      if (nc < costo[nk]) {
        costo[nk] = nc;
        previo[nk] = k;
        heap.push(nc, nk);
      }
    }
  }
  if (llegada < 0) return null;

  const ruta: number[] = [];
  for (let k = llegada; k >= 0; k = previo[k]) ruta.push(k);
  ruta.reverse();
  let cruces = 0;
  for (let t = 1; t < ruta.length; t++) if (esAgua[ruta[t]] && !esAgua[ruta[t - 1]]) cruces++;
  const linea = caminos[destino[llegada]];
  // El último punto: la proyección sobre el camino, no el centro de la celda.
  const fin = puntoSobreCamino(cx(llegada % W), cy(Math.floor(llegada / W)), segCamino.filter((s) => s.linea === destino[llegada]));
  const crudos: LatLng[] = [patioLL, ...ruta.slice(1, -1).map((k) => aLL(pl, cx(k % W), cy(Math.floor(k / W)))), aLL(pl, fin[0], fin[1])];
  const puntos = simplificarRuta(crudos, pl, res / 2);
  let pendMax: number | null = null;
  for (let t = 1; t < puntos.length; t++) {
    const [ax, ay] = aXY(pl, puntos[t - 1]);
    const [bx, by] = aXY(pl, puntos[t]);
    const tr = relieve.tramo(ax, ay, bx, by);
    if (tr.pendMax != null) pendMax = pendMax == null ? tr.pendMax : Math.max(pendMax, tr.pendMax);
  }
  const largoM = lineLengthM(puntos);
  const destinoTxt = `la vía más cercana (${etiquetaLinea(linea).toLowerCase()})`;
  const rumbo = puntos.length >= 2 ? rumboCardinal(bearingDeg(puntos[0], puntos[puntos.length - 1])).largo : "";
  const porQue =
    largoM < res
      ? `El patio ya queda sobre ${destinoTxt}: no hace falta abrir camino.`
      : `${textoDistancia(largoM)} ${rumbo} hasta ${destinoTxt}, ${pendMax == null ? "sin dato de pendiente" : `con pendiente máxima de ${r0(pendMax)} %`}${cruces ? ` y ${plural(cruces, "cruce", "cruces")} de agua` : " y sin cruzar agua"}. Es el recorrido de menor esfuerzo por el terreno, no la línea recta.` +
        (pendMax != null && pendMax > P.pendienteMaxCaminoPct ? ` Un tramo pasa el ${P.pendienteMaxCaminoPct} %: un camión cargado ahí necesita curvas o afirmado.` : "");
  return { puntos, largoM: r1(largoM), pendienteMaxPct: pendMax == null ? null : r1(pendMax), cruces, destino: etiquetaLinea(linea), porQue };
}

export function puntoSobreCamino(x: number, y: number, segs: Seg[]): [number, number] {
  let mejor: [number, number] = [x, y];
  let dMin = Infinity;
  for (const s of segs) {
    const vx = s.bx - s.ax;
    const vy = s.by - s.ay;
    const len2 = vx * vx + vy * vy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - s.ax) * vx + (y - s.ay) * vy) / len2));
    const qx = s.ax + t * vx;
    const qy = s.ay + t * vy;
    const d = Math.hypot(x - qx, y - qy);
    if (d < dMin) {
      dMin = d;
      mejor = [qx, qy];
    }
  }
  return mejor;
}

/** Douglas-Peucker sobre la ruta de la grilla (quita la escalera de celdas). */
export function simplificarRuta(puntos: LatLng[], pl: Plano, tolM: number): LatLng[] {
  if (puntos.length <= 2) return puntos;
  const xy = puntos.map((p) => aXY(pl, p));
  const guardar = new Uint8Array(puntos.length);
  guardar[0] = 1;
  guardar[puntos.length - 1] = 1;
  const pila: [number, number][] = [[0, puntos.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop() as [number, number];
    let maxD = -1;
    let idx = -1;
    for (let k = i + 1; k < j; k++) {
      const d = distPuntoSeg(xy[k][0], xy[k][1], xy[i][0], xy[i][1], xy[j][0], xy[j][1]);
      if (d > maxD) {
        maxD = d;
        idx = k;
      }
    }
    if (idx >= 0 && maxD > tolM) {
      guardar[idx] = 1;
      pila.push([i, idx], [idx, j]);
    }
  }
  return puntos.filter((_, k) => guardar[k] === 1);
}

/**
 * Campamento: cerca del patio, plano, con agua a mano pero FUERA de la faja.
 * Sin agua conocida, junto al patio y lo dice.
 */
export function ubicarCampamento(
  px: number,
  py: number,
  pl: Plano,
  relieve: Relieve,
  aguaCerca: AguaCerca,
  enFaja: EnFaja,
  rios: readonly LineaGeo[],
  zona: LatLng[],
  P: ParametrosPlan,
): CampamentoPropuesto | null {
  const paso = 25;
  const R = P.distMaxCampamentoM;
  type Cand = { x: number; y: number; dPatio: number; pend: number | null; agua: ReturnType<AguaCerca> };
  const cands: Cand[] = [];
  for (let dy = -R; dy <= R; dy += paso) {
    for (let dx = -R; dx <= R; dx += paso) {
      const dPatio = Math.hypot(dx, dy);
      if (dPatio > R || dPatio < P.distMinCampamentoPatioM) continue;
      const x = px + dx;
      const y = py + dy;
      if (zona.length >= 3 && !pointInPolygon(aLL(pl, x, y), zona)) continue;
      const pend = relieve.pendiente(x, y);
      if (pend != null && pend > P.pendienteMaxCampamentoPct) continue;
      // Dentro de la faja (+10 m de holgura por el error del trazo) no se acampa.
      if (enFaja(x, y, 10)) continue;
      cands.push({ x, y, dPatio, pend, agua: aguaCerca(x, y, P.distMaxAguaCampamentoM) });
    }
  }
  if (cands.length === 0) return null;
  const pesoPend = (p: number | null) => (p ?? 0) * 10;
  // Con agua: lo más cerca posible del agua (ya fuera de la faja) y del patio, y plano.
  const puntajeConAgua = (c: Cand) => (c.agua ? c.agua.d - c.agua.faja : 0) + 0.5 * c.dPatio + pesoPend(c.pend);
  const conAgua = cands.filter((c) => c.agua != null);
  let elegido: Cand;
  let porQue: string;
  if (conAgua.length) {
    conAgua.sort((a, b) => puntajeConAgua(a) - puntajeConAgua(b) || a.y - b.y || a.x - b.x);
    elegido = conAgua[0];
    const w = elegido.agua as NonNullable<Cand["agua"]>;
    porQue = `A ${textoDistancia(elegido.dPatio)} del patio y a ${textoDistancia(w.d)} del agua (${etiquetaLinea(rios[w.linea]).toLowerCase()}), fuera de su faja de ${w.faja} m, en terreno con ${pct(elegido.pend)}.`;
  } else {
    cands.sort((a, b) => a.dPatio + pesoPend(a.pend) - (b.dPatio + pesoPend(b.pend)) || a.y - b.y || a.x - b.x);
    elegido = cands[0];
    porQue = rios.length
      ? `No hay agua a menos de ${P.distMaxAguaCampamentoM} m del patio: el campamento va junto al patio (a ${textoDistancia(elegido.dPatio)}), en terreno con ${pct(elegido.pend)}. El agua habrá que traerla.`
      : `No se conocen ríos ni quebradas: el campamento va junto al patio (a ${textoDistancia(elegido.dPatio)}), en terreno con ${pct(elegido.pend)}. Si hay agua cerca, dibújala y vuelve a planificar.`;
  }
  const [lat, lng] = aLL(pl, elegido.x, elegido.y);
  const w = elegido.agua;
  return {
    lat,
    lng,
    distanciaPatioM: r0(elegido.dPatio),
    agua: w ? { nombre: etiquetaLinea(rios[w.linea]), clase: claseDeAgua(rios[w.linea]), distanciaM: r0(w.d), fajaM: w.faja } : null,
    pendientePct: elegido.pend == null ? null : r1(elegido.pend),
    porQue,
  };
}
