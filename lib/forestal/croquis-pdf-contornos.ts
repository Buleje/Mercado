/**
 * croquis-pdf-contornos — la forma real de cada componente del plano (ADR-465).
 *
 * Un PDF vectorial trae, además de los textos, los TRAZADOS: los rectángulos de
 * la ramada y los patios, los círculos de los números, las flechas. Acá, sin
 * pdf.js (puro y con test):
 *
 *  1. `trazadosDeOperadores`: recorre la lista de operadores de pdf.js 5
 *     (`save`/`restore`/`transform`/formularios para la matriz vigente y
 *     `constructPath` para los dibujos) y devuelve cada subtrazado cerrado y
 *     pintado como polígono en puntos de la hoja (origen arriba a la
 *     izquierda, igual que los textos). Las curvas se aplanan.
 *  2. `elegirContornos`: para cada número del plano, su contorno. Preferencia
 *     del número, en este orden:
 *       a. el trazado más chico que lo ENCIERRA y no encierra otro número;
 *       b. el trazado pegado al número (a ≤ 2,2 letras de su borde) que no
 *          encierra ningún número: en la v9 la mitad de los círculos va al
 *          lado de su rectángulo, no adentro;
 *       c. el trazado más chico que lo encierra aunque encierre otros (la
 *          ramada con la losa y la zona de cintas adentro);
 *       d. uno gigante (> 40 % del terreno) si no hay otro.
 *     Nunca: el círculo del propio número, iconos y letras (≤ 4 letras de
 *     lado), ni el borde del terreno o la hoja (≥ 85 %). Un trazado es de un
 *     solo número: si dos lo quieren, gana el que comparte palabras con los
 *     rótulos de adentro (lo que va entre paréntesis vale medio: «ALMACÉN DE
 *     HERRAMIENTAS» → 6 y no 34 «Cámara 2 (esquina del almacén)»); el que
 *     pierde prueba su siguiente opción (asignación estable). Solo juegan los
 *     números marcados: un rótulo de ruta no se lleva el patio de máquinas.
 *
 * Límites: un rectángulo dibujado como 4 líneas sueltas no es un trazado
 * cerrado (queda el cuadrado); un número lejos de su dibujo, tampoco.
 */

import type { RectHoja } from "./croquis-desde-pdf";

export type Matriz = [number, number, number, number, number, number];
/** [x, y] en puntos de la hoja, origen arriba a la izquierda. */
export type PuntoHoja = [number, number];
export interface TrazadoPdf { puntos: PuntoHoja[] }

/** `m ∘ t`: primero `t`, después `m` (la convención de pdf.js). */
export const componer = (m: ArrayLike<number>, t: ArrayLike<number>): Matriz => [
  m[0] * t[0] + m[2] * t[1], m[1] * t[0] + m[3] * t[1],
  m[0] * t[2] + m[2] * t[3], m[1] * t[2] + m[3] * t[3],
  m[0] * t[4] + m[2] * t[5] + m[4], m[1] * t[4] + m[3] * t[5] + m[5],
];
const aplicar = (m: Matriz, x: number, y: number): PuntoHoja => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// ─── Del operador de pdf.js a polígonos ────────────────────────────────────

/** `DrawOPS` de pdf.js 5: el `constructPath` trae el trazado entero en un Float32Array. */
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;
const PASOS_CURVA = 8;

/**
 * Subtrazados cerrados de un trazado de pdf.js 5 llevados a la hoja con `m`.
 * Cerrado = `closePath`, relleno (el relleno cierra solo) o punta final sobre
 * la inicial; una línea abierta solo con borde (flecha, cota) no es zona.
 */
export function subtrazadosCerrados(data: ArrayLike<number>, m: Matriz, relleno: boolean): PuntoHoja[][] {
  const out: PuntoHoja[][] = [];
  let actual: PuntoHoja[] = [];
  let cerrado = false;
  let px = 0, py = 0, sx = 0, sy = 0;
  const terminar = () => {
    if (actual.length >= 3) {
      const a = actual[0], b = actual[actual.length - 1];
      const junta = Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.5;
      if (cerrado || relleno || junta) out.push(junta ? actual.slice(0, -1) : actual);
    }
    actual = [];
    cerrado = false;
  };
  const seguir = () => { if (!actual.length) actual.push(aplicar(m, px, py)); };
  let i = 0;
  while (i < data.length) {
    const op = data[i++];
    if (op === DRAW.moveTo) {
      terminar();
      px = sx = data[i]; py = sy = data[i + 1]; i += 2;
      actual.push(aplicar(m, px, py));
    } else if (op === DRAW.lineTo) {
      seguir();
      px = data[i]; py = data[i + 1]; i += 2;
      actual.push(aplicar(m, px, py));
    } else if (op === DRAW.curveTo || op === DRAW.quadraticCurveTo) {
      seguir();
      const n = op === DRAW.curveTo ? 6 : 4;
      const c = Array.from({ length: n }, (_, k) => data[i + k]);
      i += n;
      for (let k = 1; k <= PASOS_CURVA; k++) {
        const t = k / PASOS_CURVA, u = 1 - t;
        const [x, y] = n === 6
          ? [u ** 3 * px + 3 * u * u * t * c[0] + 3 * u * t * t * c[2] + t ** 3 * c[4], u ** 3 * py + 3 * u * u * t * c[1] + 3 * u * t * t * c[3] + t ** 3 * c[5]]
          : [u * u * px + 2 * u * t * c[0] + t * t * c[2], u * u * py + 2 * u * t * c[1] + t * t * c[3]];
        actual.push(aplicar(m, x, y));
      }
      px = c[n - 2]; py = c[n - 1];
    } else if (op === DRAW.closePath) {
      cerrado = true;
      terminar();
      px = sx; py = sy;
    } else break; // Código desconocido: lo leído hasta acá vale; el resto no se adivina.
  }
  terminar();
  return out;
}

const esMatriz = (a: unknown): a is number[] => Array.isArray(a) && a.length === 6 && a.every((n) => typeof n === "number" && Number.isFinite(n));
const esNumeros = (a: unknown): a is ArrayLike<number> => a instanceof Float32Array || a instanceof Float64Array || (Array.isArray(a) && a.every((n) => typeof n === "number"));

/** Los operadores que PINTAN el trazado (no el recorte `W n`, que termina en `endPath`). */
const PINTAN = ["stroke", "closeStroke", "fill", "eoFill", "fillStroke", "eoFillStroke", "closeFillStroke", "closeEOFillStroke"];
const RELLENAN = new Set(["fill", "eoFill", "fillStroke", "eoFillStroke", "closeFillStroke", "closeEOFillStroke"]);

/**
 * Los polígonos pintados de una página: `fnArray`/`argsArray` de
 * `page.getOperatorList()`, `vista` = `viewport.transform` (lleva a puntos de
 * la hoja con el origen arriba) y `ops` = el `OPS` de pdf.js. Sin repetidos
 * (relleno y borde del mismo rectángulo) y con tope: un plano con miles de
 * achurados no cuelga el servidor.
 */
export function trazadosDeOperadores(
  fnArray: ArrayLike<number>,
  argsArray: readonly unknown[],
  vista: ArrayLike<number>,
  ops: Readonly<Record<string, number>>,
  tope = 4000,
): TrazadoPdf[] {
  const pinta = new Map(PINTAN.filter((k) => k in ops).map((k) => [ops[k], RELLENAN.has(k)]));
  let ctm: Matriz = [1, 0, 0, 1, 0, 0];
  const pila: Matriz[] = [];
  const out: TrazadoPdf[] = [];
  const vistos = new Set<string>();
  for (let i = 0; i < fnArray.length && out.length < tope; i++) {
    const fn = fnArray[i], args = argsArray[i];
    if (fn === ops.save) pila.push(ctm);
    else if (fn === ops.restore) ctm = pila.pop() ?? ctm;
    else if (fn === ops.transform && esMatriz(args)) ctm = componer(ctm, args);
    else if (fn === ops.paintFormXObjectBegin) {
      pila.push(ctm);
      const mat = Array.isArray(args) ? args[0] : null;
      if (esMatriz(mat)) ctm = componer(ctm, mat);
    } else if (fn === ops.paintFormXObjectEnd) ctm = pila.pop() ?? ctm;
    else if (fn === ops.constructPath && Array.isArray(args)) {
      const relleno = pinta.get(args[0] as number);
      const data = Array.isArray(args[1]) ? args[1][0] : null;
      if (relleno === undefined || !esNumeros(data)) continue;
      const total = componer(vista, ctm);
      for (const puntos of subtrazadosCerrados(data, total, relleno)) {
        const xs = puntos.map((p) => p[0]), ys = puntos.map((p) => p[1]);
        const caja = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        if (caja[2] - caja[0] < 1 && caja[3] - caja[1] < 1) continue; // un punto: nada que encerrar
        const clave = `${caja.map((n) => Math.round(n * 2)).join(",")}:${puntos.length}`;
        if (vistos.has(clave)) continue;
        vistos.add(clave);
        out.push({ puntos });
        if (out.length >= tope) break;
      }
    }
  }
  return out;
}

// ─── Geometría plana ───────────────────────────────────────────────────────

export function areaPoligono(pts: readonly (readonly [number, number])[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

function contiene(pts: readonly PuntoHoja[], x: number, y: number): boolean {
  let dentro = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function distanciaAlBorde(pts: readonly PuntoHoja[], x: number, y: number): number {
  let d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0;
    d = Math.min(d, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return d;
}

/** Sin puntos repetidos ni intermedios sobre una recta (un rectángulo recortado vuelve a tener 4). */
function simplificar(pts: [number, number][]): [number, number][] {
  let p = pts.filter((a, i) => { const b = pts[(i + 1) % pts.length]; return Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-4; });
  for (let tol = 2e-5, vuelta = 0; p.length > 3 && vuelta < 8; tol *= 4, vuelta++) {
    const q = p.filter((b, i) => {
      const a = p[(i - 1 + p.length) % p.length], c = p[(i + 1) % p.length];
      return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) > tol;
    });
    p = q.length >= 3 ? q : p;
    if (p.length <= 80) break;
  }
  return p;
}

// ─── Elegir el contorno de cada número ─────────────────────────────────────

export type ContornoDe = "adentro" | "al_lado" | "grande";
export interface MarcaContorno { clave: string; numero: number; nombre: string; x: number; y: number; h: number; sugerido: boolean }
export interface RotuloContorno { texto: string; x: number; y: number }
export interface ContornoElegido {
  /** Fracción de la imagen recortada [fx, fy], origen abajo a la izquierda, dentro del terreno. */
  puntos: [number, number][];
  de: ContornoDe;
  /** Otros números marcados que quedan adentro (la ramada con su losa). */
  encierra: number[];
}

/** Fracción del terreno: debajo es un punto o un ícono; arriba, el borde del terreno o de la hoja. */
const AREA_MIN = 0.0002, AREA_GRANDE = 0.4, AREA_TERRENO = 0.85;
/** En letras del número: el círculo del número y los íconos miden menos de esto por lado. */
const LADO_INSIGNIA = 4;
/** En letras del número: hasta dónde un trazado está «al lado». */
const PEGADO = 2.2;

const normal = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const VACIAS = new Set(["para", "con", "del", "las", "los", "zona", "solo", "entre", "sobre", "desde", "hacia", "salida"]);
const palabras = (s: string) => normal(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length >= 4 && !VACIAS.has(w) && !/^\d+$/.test(w));
/** Palabras del nombre con su peso: lo que va entre paréntesis aclara, no nombra (vale medio). */
function pesos(nombre: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of palabras(nombre.replace(/\([^)]*\)/g, " "))) m.set(w, 1);
  for (const [, dentro] of nombre.matchAll(/\(([^)]*)\)/g)) for (const w of palabras(dentro)) if (!m.has(w)) m.set(w, 0.5);
  return m;
}

interface Poli { pts: PuntoHoja[]; frac: [number, number][]; area: number; ancho: number; alto: number; adentro: MarcaContorno[] }
interface Opcion { poli: number; nivel: 0 | 1 | 2 | 3; orden: number }

export function elegirContornos(
  trazados: readonly TrazadoPdf[],
  recorte: RectHoja,
  marcas: readonly MarcaContorno[],
  rotulos: readonly RotuloContorno[],
): { porClave: Map<string, ContornoElegido>; utiles: number } {
  const porClave = new Map<string, ContornoElegido>();
  if (!trazados.length || !marcas.length || recorte.w <= 0 || recorte.h <= 0) return { porClave, utiles: 0 };
  const lim = (n: number) => Math.min(1, Math.max(0, n));
  const sugeridas = marcas.filter((m) => m.sugerido);
  if (!sugeridas.length) return { porClave, utiles: 0 };

  const polis: Poli[] = [];
  for (const t of trazados) {
    if (t.puntos.length < 3) continue;
    const frac = simplificar(t.puntos.map(([x, y]) => [lim((x - recorte.x) / recorte.w), lim((recorte.y + recorte.h - y) / recorte.h)]));
    const area = frac.length >= 3 ? areaPoligono(frac) : 0;
    if (area < AREA_MIN || area >= AREA_TERRENO) continue;
    const xs = t.puntos.map((p) => p[0]), ys = t.puntos.map((p) => p[1]);
    polis.push({
      pts: t.puntos, frac, area,
      ancho: Math.max(...xs) - Math.min(...xs), alto: Math.max(...ys) - Math.min(...ys),
      adentro: sugeridas.filter((m) => contiene(t.puntos, m.x, m.y)),
    });
  }

  // Preferencias de cada número (a → d de la cabecera); dentro de cada nivel, el más chico o el más cercano.
  const opciones = new Map<string, Opcion[]>();
  for (const m of sugeridas) {
    const lista: Opcion[] = [];
    polis.forEach((p, i) => {
      if (Math.max(p.ancho, p.alto) <= LADO_INSIGNIA * m.h) return;
      const otros = p.adentro.filter((o) => o.clave !== m.clave);
      if (contiene(p.pts, m.x, m.y)) {
        lista.push({ poli: i, nivel: p.area > AREA_GRANDE ? 3 : otros.length ? 2 : 0, orden: p.area });
      } else if (!p.adentro.length && p.area <= AREA_GRANDE) {
        const d = distanciaAlBorde(p.pts, m.x, m.y);
        if (d <= PEGADO * m.h) lista.push({ poli: i, nivel: 1, orden: d });
      }
    });
    opciones.set(m.clave, lista.sort((a, b) => a.nivel - b.nivel || a.orden - b.orden));
  }

  // Un trazado, un número: si dos lo quieren, gana el que nombra los rótulos de
  // adentro, después el de mejor nivel y el más metido (no el pegado al borde).
  const afinidad = new Map<string, number>();
  const puntaje = (m: MarcaContorno, i: number) => {
    const k = `${m.clave}|${i}`;
    let v = afinidad.get(k);
    if (v === undefined) {
      const deAdentro = new Set(rotulos.filter((r) => contiene(polis[i].pts, r.x, r.y)).flatMap((r) => palabras(r.texto)));
      v = [...pesos(m.nombre)].reduce((s, [w, peso]) => s + (deAdentro.has(w) ? peso : 0), 0);
      afinidad.set(k, v);
    }
    return v;
  };
  const gana = (a: MarcaContorno, oa: Opcion, b: MarcaContorno, ob: Opcion) => {
    const pa = puntaje(a, oa.poli), pb = puntaje(b, ob.poli);
    if (pa !== pb) return pa > pb;
    if (oa.nivel !== ob.nivel) return oa.nivel < ob.nivel;
    const hondo = (m: MarcaContorno, o: Opcion) => (o.nivel === 1 ? -o.orden : distanciaAlBorde(polis[o.poli].pts, m.x, m.y));
    return hondo(a, oa) > hondo(b, ob);
  };
  const siguiente = new Map(sugeridas.map((m) => [m.clave, 0]));
  const tomado = new Map<number, { m: MarcaContorno; o: Opcion }>();
  const cola = [...sugeridas].reverse();
  while (cola.length) {
    const m = cola.pop()!;
    const lista = opciones.get(m.clave) ?? [];
    const k = siguiente.get(m.clave) ?? 0;
    if (k >= lista.length) continue;
    siguiente.set(m.clave, k + 1);
    const o = lista[k];
    const actual = tomado.get(o.poli);
    if (!actual) tomado.set(o.poli, { m, o });
    else if (gana(m, o, actual.m, actual.o)) { tomado.set(o.poli, { m, o }); cola.push(actual.m); }
    else cola.push(m);
  }

  const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
  for (const [i, { m, o }] of tomado) {
    const p = polis[i];
    porClave.set(m.clave, {
      puntos: p.frac.map(([x, y]) => [r4(x), r4(y)]),
      de: o.nivel === 3 ? "grande" : o.nivel === 1 ? "al_lado" : "adentro",
      encierra: [...new Set(p.adentro.filter((x) => x.numero !== m.numero).map((x) => x.numero))].sort((a, b) => a - b),
    });
  }
  return { porClave, utiles: polis.length };
}

/** Área del contorno en m² con las medidas finales del terreno. */
export const areaContornoM2 = (puntos: readonly [number, number][], terreno: { anchoM: number; altoM: number }) =>
  areaPoligono(puntos) * terreno.anchoM * terreno.altoM;
