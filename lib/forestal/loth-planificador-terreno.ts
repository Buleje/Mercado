/**
 * loth-planificador-terreno — las piezas geométricas del planificador:
 * el plano local en metros, distancias y cruces de segmentos, el índice de
 * segmentos (agua y caminos), el relieve (altitud y pendiente sobre la grilla)
 * y el montículo de Dijkstra/Prim. PURO. Separado de `loth-planificador.ts`
 * para que el planificador se lea como decisiones y no como álgebra.
 */

import type { LatLng } from "./loth-geo";
import { elevacionEn, ladosM, type GrillaElevacion, type LineaGeo } from "./loth-geografia";
import type { ClaseAgua } from "./loth-planificador";


// ─── Utilidades de plano local ───────────────────────────────────────────────

export const M_POR_GRADO_LAT = 111_132;
export const rad = (d: number) => (d * Math.PI) / 180;
export const r1 = (n: number) => Math.round(n * 10) / 10;
export const r0 = (n: number) => Math.round(n);

export interface Plano {
  lat0: number;
  lng0: number;
  mx: number;
}

export const crearPlano = (lat0: number, lng0: number): Plano => ({ lat0, lng0, mx: 111_320 * Math.cos(rad(lat0)) || 1 });
export const aXY = (pl: Plano, p: LatLng): [number, number] => [(p[1] - pl.lng0) * pl.mx, (p[0] - pl.lat0) * M_POR_GRADO_LAT];
export const aLL = (pl: Plano, x: number, y: number): LatLng => [pl.lat0 + y / M_POR_GRADO_LAT, pl.lng0 + x / pl.mx];

/** Distancia punto–segmento en el plano. */
export function distPuntoSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/** Parámetro t (0..1) donde el segmento AB corta a CD, o null. */
export function cruceSeg(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number | null {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qx = cx - ax;
  const qy = cy - ay;
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  // Holgura en `u` (el tramo del río): un tramo que pasa justo por un vértice
  // cae en u≈1 de un tramo y u≈0 del siguiente, y el redondeo podía dejarlo
  // afuera de los dos (49 de 2 000 casos medidos): el cruce desaparecía. Los
  // dos aciertos tienen el mismo `t`, y `cruces` los cuenta una vez.
  const EPS = 1e-9;
  return t >= 0 && t <= 1 && u >= -EPS && u <= 1 + EPS ? t : null;
}

export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  linea: number;
}

/** Índice de segmentos en celdas: la búsqueda de «agua cerca» deja de ser N×M. */
export class IndiceSegmentos {
  private readonly mapa = new Map<string, number[]>();
  readonly segs: Seg[] = [];
  constructor(private readonly celda: number) {}

  private clave(i: number, j: number) {
    return `${i}:${j}`;
  }

  agregar(s: Seg): void {
    const idx = this.segs.push(s) - 1;
    const i0 = Math.floor(Math.min(s.ax, s.bx) / this.celda);
    const i1 = Math.floor(Math.max(s.ax, s.bx) / this.celda);
    const j0 = Math.floor(Math.min(s.ay, s.by) / this.celda);
    const j1 = Math.floor(Math.max(s.ay, s.by) / this.celda);
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const k = this.clave(i, j);
        const l = this.mapa.get(k);
        if (l) l.push(idx);
        else this.mapa.set(k, [idx]);
      }
    }
  }

  /** Índices de los segmentos cuyas celdas tocan la caja. */
  enCaja(minx: number, miny: number, maxx: number, maxy: number): number[] {
    const out = new Set<number>();
    const i0 = Math.floor(minx / this.celda);
    const i1 = Math.floor(maxx / this.celda);
    const j0 = Math.floor(miny / this.celda);
    const j1 = Math.floor(maxy / this.celda);
    // Una caja con más celdas que segmentos se resuelve recorriendo los
    // segmentos: un patio fijado (o un árbol con la UTM errada) a 100 km
    // recorría ~10⁶ celdas vacías por tramo y el cálculo tardaba 5 s (a 300 km,
    // ~45 s con el hilo del servidor tomado). Mismo resultado: todo segmento
    // que un llamador necesita (a menos de un radio, o que cruza) toca la caja.
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > this.segs.length) {
      const hits: number[] = [];
      this.segs.forEach((s, k) => {
        if (Math.max(s.ax, s.bx) >= minx && Math.min(s.ax, s.bx) <= maxx && Math.max(s.ay, s.by) >= miny && Math.min(s.ay, s.by) <= maxy) hits.push(k);
      });
      return hits;
    }
    for (let i = i0; i <= i1; i++) {
      for (let j = j0; j <= j1; j++) {
        const l = this.mapa.get(this.clave(i, j));
        if (l) for (const s of l) out.add(s);
      }
    }
    return [...out];
  }

  /** El segmento más cercano dentro de `radio`; null si no hay ninguno. */
  masCercano(x: number, y: number, radio: number): { d: number; linea: number } | null {
    let mejor: { d: number; linea: number } | null = null;
    for (const k of this.enCaja(x - radio, y - radio, x + radio, y + radio)) {
      const s = this.segs[k];
      const d = distPuntoSeg(x, y, s.ax, s.ay, s.bx, s.by);
      if (d <= radio && (!mejor || d < mejor.d)) mejor = { d, linea: s.linea };
    }
    return mejor;
  }

  /** Veces que el segmento PQ cruza alguna línea (un cruce en un vértice cuenta una vez). */
  cruces(px: number, py: number, qx: number, qy: number): number {
    const ts: number[] = [];
    for (const k of this.enCaja(Math.min(px, qx), Math.min(py, qy), Math.max(px, qx), Math.max(py, qy))) {
      const s = this.segs[k];
      const t = cruceSeg(px, py, qx, qy, s.ax, s.ay, s.bx, s.by);
      if (t != null) ts.push(t);
    }
    if (ts.length <= 1) return ts.length;
    ts.sort((a, b) => a - b);
    let n = 1;
    for (let i = 1; i < ts.length; i++) if (ts[i] - ts[i - 1] > 1e-6) n++;
    return n;
  }
}

/** El relieve en metros locales: altitud, pendiente en un punto y a lo largo de un tramo. */
export class Relieve {
  readonly celdaM: number;
  constructor(
    private readonly g: GrillaElevacion | null,
    private readonly pl: Plano,
  ) {
    if (g && g.nx > 1 && g.ny > 1) {
      const { anchoM, altoM } = ladosM(g.bbox);
      this.celdaM = Math.max(10, Math.min(anchoM / (g.nx - 1), altoM / (g.ny - 1)));
    } else {
      this.celdaM = 100;
    }
  }

  get hay(): boolean {
    return this.g != null;
  }

  z(x: number, y: number): number | null {
    return this.g ? elevacionEn(this.g, aLL(this.pl, x, y)) : null;
  }

  /** Pendiente del terreno en un punto (%), por diferencias centrales a media celda. */
  pendiente(x: number, y: number): number | null {
    if (!this.g) return null;
    const h = Math.max(15, this.celdaM / 2);
    const e = this.z(x + h, y);
    const o = this.z(x - h, y);
    const n = this.z(x, y + h);
    const s = this.z(x, y - h);
    if (e == null || o == null || n == null || s == null) return null;
    return Math.hypot((e - o) / (2 * h), (n - s) / (2 * h)) * 100;
  }

  /**
   * Recorre el tramo en pasos de ~1/3 de celda: costo = Σ largo × (1 + (pend/15)²)
   * —una trocha al 15 % cuesta el doble que en plano, al 30 % cinco veces— y la
   * pendiente máxima del recorrido.
   */
  tramo(ax: number, ay: number, bx: number, by: number): { costo: number; pendMax: number | null } {
    const largo = Math.hypot(bx - ax, by - ay);
    if (!this.g || largo === 0) return { costo: largo, pendMax: null };
    const paso = Math.max(15, this.celdaM / 3);
    const n = Math.max(1, Math.min(40, Math.ceil(largo / paso)));
    const sub = largo / n;
    let costo = 0;
    let pendMax: number | null = null;
    let zPrev = this.z(ax, ay);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const z = this.z(ax + (bx - ax) * t, ay + (by - ay) * t);
      if (z != null && zPrev != null) {
        const p = (Math.abs(z - zPrev) / sub) * 100;
        costo += sub * (1 + (p / 15) ** 2);
        pendMax = pendMax == null ? p : Math.max(pendMax, p);
      } else {
        costo += sub;
      }
      zPrev = z;
    }
    return { costo, pendMax };
  }
}

/** Min-heap binario de (costo, nodo). */
export class Monticulo {
  private readonly c: number[] = [];
  private readonly n: number[] = [];
  get vacio() {
    return this.c.length === 0;
  }
  push(costo: number, nodo: number) {
    this.c.push(costo);
    this.n.push(nodo);
    let i = this.c.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.c[p] <= this.c[i]) break;
      [this.c[p], this.c[i]] = [this.c[i], this.c[p]];
      [this.n[p], this.n[i]] = [this.n[i], this.n[p]];
      i = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.c[0], this.n[0]];
    const lc = this.c.pop() as number;
    const ln = this.n.pop() as number;
    if (this.c.length) {
      this.c[0] = lc;
      this.n[0] = ln;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.c.length && this.c[l] < this.c[m]) m = l;
        if (r < this.c.length && this.c[r] < this.c[m]) m = r;
        if (m === i) break;
        [this.c[m], this.c[i]] = [this.c[i], this.c[m]];
        [this.n[m], this.n[i]] = [this.n[i], this.n[m]];
        i = m;
      }
    }
    return top;
  }
}

export const pct = (p: number | null) => (p == null ? "sin dato de pendiente" : `${r0(p)} % de pendiente`);
export const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("en-US")} ${n === 1 ? uno : varios}`;

export function claseDeAgua(l: LineaGeo): ClaseAgua {
  return l.tipo === "river" || l.tipo === "rio" ? "rio" : "quebrada";
}