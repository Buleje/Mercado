/**
 * testas-medicion — el Ø de cada troza por la foto de la cara de la carga
 * (Brandon 16-10: «tomar foto a los laterales del camión o a la cara de los
 * troncos, sacar de cada tronco su diámetro, asignar código según el
 * correlativo y hacer tabla; luego pasar eso a la GTF»). Contrato:
 * `.claude/autonomo/contratos-2026-10-16/fotos-trozas.md` §3.3 — F1: la cara
 * de atrás da D1; F2 (Brandon 16-10): la de adelante da D2 (`emparejarCaras`).
 * Sin la otra cara D2 se tipea (vacío = troza pareja, ADR-492, y se marca).
 * El Ø es CON corteza (Brandon 16-10); la descortezada, el de la madera.
 *
 * Cómo mide: una hoja A4 con un marcador ArUco de 180 mm (id 248 o 249,
 * `IDS_HOJA_ESCALA`) pegada en una testa del centro da la escala y la
 * perspectiva (homografía). El worker endereza la foto a mm, busca círculos y
 * ajusta una elipse al borde de cada testa (`camaras/testas-cv.ts`). Acá vive
 * lo PURO: la homografía, el marco enderezado, el Ø como lo guarda el libro,
 * el orden de lectura y el paso a filas de «Anotar a mano».
 *
 * Lo declarado lo confirma el operador: nada de esto escribe. «Pasar a la
 * guía» deja las filas en la lista a mano y el despacho las registra.
 */
import { codigoDeLaGuia } from "./codigo-unico-troza";
import {
  piezasAMano,
  trozaAManoSchema,
  trozasDeFilas,
  volumenPorTroza,
  type ArbolParaNumerar,
  type TrozaAMano,
} from "./loth-trozas-a-mano";

/**
 * Los marcadores de la hoja de escala. 248 y 249 eran del rango de prueba
 * (245-249, ADR-480) y nadie los usaba: nunca son una troza (0-199) ni un
 * chaleco (200-244), así que la cámara del aserradero tampoco los cuenta.
 */
export const IDS_HOJA_ESCALA = [248, 249] as const;
export type IdHojaEscala = (typeof IDS_HOJA_ESCALA)[number];
export const esIdHojaEscala = (id: number): id is IdHojaEscala => (IDS_HOJA_ESCALA as readonly number[]).includes(id);
/** El lado del cuadro negro del marcador impreso (A4, sin escalar). */
export const LADO_HOJA_ESCALA_MM = 180;
/** Con la hoja más chica que esto en la foto el Ø sale ~1 cm corto (bench 16-10: a 70 px, −1 cm). */
export const LADO_MIN_HOJA_PX = 100;
/** El Ø que se busca (cm): ni una rama ni media carga. */
export const D_BUSCADO_CM = { min: 25, max: 120 } as const;
/** La foto enderezada: nunca más fina que 1,5 mm por px ni más larga que 2400 px. */
const MM_POR_PX_MIN = 1.5;
const LADO_ENDEREZADA_MAX_PX = 2400;
/** Cuánto se endereza alrededor de las hojas (mm): la carga de un camión entra de sobra. */
const ALCANCE_MM = 3500;

export type Punto = readonly [number, number];
/** Matriz 3×3 por filas. */
export type Matriz3 = readonly [number, number, number, number, number, number, number, number, number];

export function aplicar(H: Matriz3, [x, y]: Punto): [number, number] {
  const w = H[6] * x + H[7] * y + H[8];
  return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

export function multiplicar(A: Matriz3, B: Matriz3): Matriz3 {
  const C = new Array<number>(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
  return C as unknown as Matriz3;
}

export function invertir(H: Matriz3): Matriz3 | null {
  const [a, b, c, d, e, f, g, h, i] = H;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const adj = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d];
  return adj.map((v) => v / det) as unknown as Matriz3;
}

/** Lleva los puntos a centro 0 y distancia media √2 (Hartley): la homografía sale estable con px y mm mezclados. */
function normalizador(pts: readonly Punto[]): Matriz3 {
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const d = pts.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cy), 0) / pts.length || 1;
  const s = Math.SQRT2 / d;
  return [s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1];
}

/** Gauss-Jordan con pivote parcial sobre una matriz aumentada n×(n+1). */
function resolver(M: number[][]): number[] | null {
  const n = M.length;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const k = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= k * M[col][c];
    }
  }
  return M.map((fila, i) => fila[n] / fila[i]);
}

/**
 * La homografía que lleva `origen` a `destino` (≥ 4 pares), por mínimos
 * cuadrados (DLT normalizado). Con 4 pares es exacta; con 8 (dos hojas)
 * reparte el error. `null` si los puntos no la definen (colineales).
 */
export function homografia(origen: readonly Punto[], destino: readonly Punto[]): Matriz3 | null {
  if (origen.length !== destino.length || origen.length < 4) return null;
  const T1 = normalizador(origen);
  const T2 = normalizador(destino);
  const M = Array.from({ length: 8 }, () => new Array<number>(9).fill(0));
  for (let i = 0; i < origen.length; i++) {
    const [x, y] = aplicar(T1, origen[i]);
    const [u, v] = aplicar(T2, destino[i]);
    const filas: [number[], number][] = [
      [[x, y, 1, 0, 0, 0, -u * x, -u * y], u],
      [[0, 0, 0, x, y, 1, -v * x, -v * y], v],
    ];
    for (const [r, b] of filas) {
      for (let j = 0; j < 8; j++) {
        for (let k = 0; k < 8; k++) M[j][k] += r[j] * r[k];
        M[j][8] += r[j] * b;
      }
    }
  }
  const h = resolver(M);
  const T2i = invertir(T2);
  if (!h || !T2i || h.some((v) => !Number.isFinite(v))) return null;
  const H = multiplicar(T2i, multiplicar([...h, 1] as unknown as Matriz3, T1));
  return H.map((v) => v / H[8]) as unknown as Matriz3;
}

/** Las esquinas del marcador en mm, en el orden en que las da ArUco: arriba-izq, arriba-der, abajo-der, abajo-izq. */
export function cuadradoDeLaHoja(lado: number = LADO_HOJA_ESCALA_MM): Punto[] {
  return [
    [0, 0],
    [lado, 0],
    [lado, lado],
    [0, lado],
  ];
}

/** El cuadrado de la hoja puesto SIN deformar (girado y corrido) donde mejor calza con `destino` (Procrustes). */
function cuadradoRigidoSobre(destino: readonly Punto[], lado: number): Punto[] {
  const m = cuadradoDeLaHoja(lado);
  const c = lado / 2;
  const dx = destino.reduce((a, p) => a + p[0], 0) / destino.length;
  const dy = destino.reduce((a, p) => a + p[1], 0) / destino.length;
  let a = 0;
  let b = 0;
  m.forEach(([x, y], i) => {
    const [u, v] = [destino[i][0] - dx, destino[i][1] - dy];
    a += (x - c) * u + (y - c) * v;
    b += (x - c) * v - (y - c) * u;
  });
  const t = Math.atan2(b, a);
  const [co, si] = [Math.cos(t), Math.sin(t)];
  return m.map(([x, y]) => [co * (x - c) - si * (y - c) + dx, si * (x - c) + co * (y - c) + dy] as const);
}

/** El cuadrado de la hoja girado `t` rad con el centro en (cx, cy). */
function cuadradoEn(cx: number, cy: number, t: number, lado: number): Punto[] {
  const c = lado / 2;
  const [co, si] = [Math.cos(t), Math.sin(t)];
  return cuadradoDeLaHoja(lado).map(([x, y]) => [co * (x - c) - si * (y - c) + cx, si * (x - c) + co * (y - c) + cy] as const);
}

/**
 * Dos hojas: el plano → foto que mejor explica las 8 esquinas EN PX, con la
 * primera hoja fija en el origen y la segunda como un cuadrado perfecto cuyo
 * sitio y giro también se ajustan (11 incógnitas, 16 ecuaciones,
 * Levenberg-Marquardt). Ajustar alternando (hoja 2 encima, DLT, otra vez)
 * arrastraba el error de perspectiva de la hoja 1: con esquinas enteras el Ø
 * salía +4 % (banco 16-10). Devuelve foto → plano, o `null` si no converge.
 */
function ajustarDosHojas(h1: readonly Punto[], h2: readonly Punto[], H1: Matriz3, lado: number): Matriz3 | null {
  const foto = [...h1, ...h2];
  const sobre = cuadradoRigidoSobre(h2.map((p) => aplicar(H1, p)), lado);
  const G0 = invertir(H1);
  if (!G0) return null;
  /* Todo normalizado (Hartley) para que las 11 incógnitas pesen parecido. */
  const Tf = normalizador(foto);
  const Tm = normalizador([...cuadradoDeLaHoja(lado), ...sobre]);
  const Tfi = invertir(Tf);
  const Tmi = invertir(Tm);
  if (!Tfi || !Tmi) return null;
  const Gn = multiplicar(Tf, multiplicar(G0, Tmi));
  const objetivo = foto.map((p) => aplicar(Tf, p));
  const c2 = sobre.reduce((a, p) => [a[0] + p[0] / 4, a[1] + p[1] / 4] as [number, number], [0, 0]);
  const t2 = Math.atan2(sobre[1][1] - sobre[0][1], sobre[1][0] - sobre[0][0]);
  const esc = Tm[0];
  /* Incógnitas: Gn[0..7] (Gn[8] = 1) y la hoja 2 (centro y giro, normalizados). */
  let x = [...Gn.slice(0, 8).map((v) => v / Gn[8]), c2[0] * esc, c2[1] * esc, t2];
  const residuos = (v: readonly number[]): number[] => {
    const G = [...v.slice(0, 8), 1] as unknown as Matriz3;
    const mundo = [...cuadradoDeLaHoja(lado), ...cuadradoEn(v[8] / esc, v[9] / esc, v[10], lado)].map((p) => aplicar(Tm, p));
    return mundo.flatMap((p, i) => {
      const q = aplicar(G, p);
      return [q[0] - objetivo[i][0], q[1] - objetivo[i][1]];
    });
  };
  const costo = (r: readonly number[]) => r.reduce((a, v) => a + v * v, 0);
  let r = residuos(x);
  let c = costo(r);
  let lambda = 1e-3;
  for (let it = 0; it < 60; it++) {
    const n = x.length;
    const J = x.map((_, j) => {
      const h = 1e-7 * Math.max(1, Math.abs(x[j]));
      const mas = [...x];
      const menos = [...x];
      mas[j] += h;
      menos[j] -= h;
      const rm = residuos(mas);
      const rn = residuos(menos);
      return rm.map((v, k) => (v - rn[k]) / (2 * h));
    });
    const JtJ = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => J[a].reduce((s, v, k) => s + v * J[b][k], 0)));
    const Jtr = J.map((col) => col.reduce((s, v, k) => s + v * r[k], 0));
    let mejoro = false;
    while (lambda < 1e12) {
      const M = JtJ.map((fila, a) => [...fila.map((v, b) => (a === b ? v * (1 + lambda) + 1e-15 : v)), -Jtr[a]]);
      const d = resolver(M);
      if (!d) {
        lambda *= 10;
        continue;
      }
      const xn = x.map((v, j) => v + d[j]);
      const rn = residuos(xn);
      const cn = costo(rn);
      if (Number.isFinite(cn) && cn < c) {
        const paso = Math.max(...d.map(Math.abs));
        [x, r, c] = [xn, rn, cn];
        lambda = Math.max(1e-9, lambda / 10);
        mejoro = paso > 1e-12;
        break;
      }
      lambda *= 10;
    }
    if (!mejoro) break;
  }
  const G = multiplicar(Tfi, multiplicar([...x.slice(0, 8), 1] as unknown as Matriz3, Tm));
  const H = invertir(G);
  if (!H || H.some((v) => !Number.isFinite(v))) return null;
  return H.map((v) => v / H[8]) as unknown as Matriz3;
}

/** Un marcador leído en la foto: su id y sus 4 esquinas en px, en el orden de ArUco. */
export interface HojaLeida {
  id: number;
  esquinas: readonly Punto[];
}

export const ladoEnPx = (esquinas: readonly Punto[]): number =>
  esquinas.reduce((a, p, k) => {
    const q = esquinas[(k + 1) % esquinas.length];
    return a + Math.hypot(q[0] - p[0], q[1] - p[1]) / esquinas.length;
  }, 0);

export interface EscalaDeLaFoto {
  /** Foto (px) → plano de las testas (mm, origen en la esquina de arriba-izq de la primera hoja, y hacia abajo). */
  H: Matriz3;
  hojas: { id: IdHojaEscala; ladoPx: number; esquinasMm: Punto[] }[];
}

/**
 * La escala y la perspectiva de la foto por sus hojas de escala. Una hoja
 * basta; con dos (una por costado de la carga) la homografía calza las DOS,
 * cada una como un cuadrado perfecto de 180 mm donde caiga (su sitio no se
 * conoce: se ajusta en 6 vueltas). `null` = no hay hoja de escala en la foto.
 */
export function escalaDeLasHojas(leidas: readonly HojaLeida[], lado: number = LADO_HOJA_ESCALA_MM): EscalaDeLaFoto | null {
  const porId = new Map<IdHojaEscala, HojaLeida>();
  for (const h of leidas) {
    if (!esIdHojaEscala(h.id) || h.esquinas.length !== 4) continue;
    const antes = porId.get(h.id);
    if (!antes || ladoEnPx(h.esquinas) > ladoEnPx(antes.esquinas)) porId.set(h.id, h);
  }
  const hojas = [...porId.values()].sort((a, b) => a.id - b.id);
  if (hojas.length === 0) return null;
  const base = cuadradoDeLaHoja(lado);
  const H1 = homografia(hojas[0].esquinas, base);
  if (!H1) return null;
  const final: Matriz3 = (hojas.length > 1 && ajustarDosHojas(hojas[0].esquinas, hojas[1].esquinas, H1, lado)) || H1;
  return {
    H: final,
    hojas: hojas.map((h) => ({
      id: h.id as IdHojaEscala,
      ladoPx: Math.round(ladoEnPx(h.esquinas) * 10) / 10,
      esquinasMm: h.esquinas.map((p) => aplicar(final, p)),
    })),
  };
}

/** La foto enderezada: cuántos mm mide cada px y la matriz que la arma desde la foto. */
export interface MarcoEnderezado {
  /** Foto (px) → foto enderezada (px). */
  M: Matriz3;
  mmPorPx: number;
  ancho: number;
  alto: number;
  /** Dónde cae el px (0,0) de la enderezada en el plano de las testas (mm). */
  origenMm: Punto;
}

/**
 * Qué parte del plano se endereza: lo que la foto ve, recortado a
 * `ALCANCE_MM` alrededor de las hojas (más allá la perspectiva estira el
 * cielo o el suelo, no hay carga). La escala es la más fina que deja el lado
 * largo en ≤ 2400 px, nunca menos de 1,5 mm por px.
 */
export function marcoEnderezado(escala: EscalaDeLaFoto, foto: { ancho: number; alto: number }): MarcoEnderezado {
  const { ancho: W, alto: A } = foto;
  const borde: Punto[] = [
    [0, 0],
    [W / 2, 0],
    [W, 0],
    [W, A / 2],
    [W, A],
    [W / 2, A],
    [0, A],
    [0, A / 2],
  ];
  const H = escala.H;
  const vistos = borde.flatMap((p) => {
    const w = H[6] * p[0] + H[7] * p[1] + H[8];
    return w > 0 ? [aplicar(H, p)] : [];
  });
  const hojas = escala.hojas.flatMap((h) => h.esquinasMm);
  const hx = hojas.map((p) => p[0]);
  const hy = hojas.map((p) => p[1]);
  const lim = {
    x0: Math.min(...hx) - ALCANCE_MM,
    x1: Math.max(...hx) + ALCANCE_MM,
    y0: Math.min(...hy) - ALCANCE_MM,
    y1: Math.max(...hy) + ALCANCE_MM,
  };
  const xs = vistos.length ? vistos.map((p) => p[0]) : [lim.x0, lim.x1];
  const ys = vistos.length ? vistos.map((p) => p[1]) : [lim.y0, lim.y1];
  const x0 = Math.max(Math.min(...xs), lim.x0);
  const x1 = Math.min(Math.max(...xs), lim.x1);
  const y0 = Math.max(Math.min(...ys), lim.y0);
  const y1 = Math.min(Math.max(...ys), lim.y1);
  const mmPorPx = Math.max(MM_POR_PX_MIN, Math.max(x1 - x0, y1 - y0) / LADO_ENDEREZADA_MAX_PX);
  const S: Matriz3 = [1 / mmPorPx, 0, -x0 / mmPorPx, 0, 1 / mmPorPx, -y0 / mmPorPx, 0, 0, 1];
  return {
    M: multiplicar(S, H),
    mmPorPx,
    ancho: Math.max(1, Math.ceil((x1 - x0) / mmPorPx)),
    alto: Math.max(1, Math.ceil((y1 - y0) / mmPorPx)),
    origenMm: [x0, y0],
  };
}

/** El radio (px de la enderezada) de los Ø que se buscan. */
export function radiosBuscados(mmPorPx: number): { min: number; max: number } {
  return { min: Math.round((D_BUSCADO_CM.min * 5) / mmPorPx), max: Math.round((D_BUSCADO_CM.max * 5) / mmPorPx) };
}

/** Una testa que propone la foto (o que el operador agregó o corrigió). */
export interface TestaPropuesta {
  id: string;
  /** Centro y semiejes en px de la foto ENDEREZADA (1 px = `mmPorPx` mm). */
  cx: number;
  cy: number;
  aPx: number;
  bPx: number;
  anguloGrados: number;
  ejeMayorCm: number;
  ejeMenorCm: number;
  /** El Ø como lo guarda el libro (cm, 1 decimal): el promedio de los dos ejes de la elipse. */
  dCm: number;
  origen: "auto" | "agregada" | "ajustada";
  /** Cuántos puntos del borde sostienen la elipse (0 = puesta a ojo). */
  puntosBorde: number;
  /** El grueso de la corteza que se sumó al Ø (cm; ausente o 0 = troza descortezada: el Ø es el de la madera). */
  cortezaCm?: number;
}

/** Lo que devuelve OpenCV de una elipse (`fitEllipse`): ejes COMPLETOS en px. */
export interface ElipseCruda {
  cx: number;
  cy: number;
  ancho: number;
  alto: number;
  angulo: number;
  puntos: number;
}

const a1 = (v: number): number => Math.round(v * 10) / 10;

/** El Ø en cm a 1 decimal (lo que guarda el libro: Ø en m a 3 decimales) de una elipse de ejes completos en px. */
export const diametroCm = (ejeA: number, ejeB: number, mmPorPx: number): number => Math.round(((ejeA + ejeB) / 2) * mmPorPx) / 10;

export function testaDeElipse(e: ElipseCruda, mmPorPx: number, id: string, origen: TestaPropuesta["origen"]): TestaPropuesta {
  const mayor = Math.max(e.ancho, e.alto);
  const menor = Math.min(e.ancho, e.alto);
  return {
    id,
    cx: a1(e.cx),
    cy: a1(e.cy),
    aPx: a1(e.ancho / 2),
    bPx: a1(e.alto / 2),
    anguloGrados: a1(e.angulo),
    ejeMayorCm: a1((mayor * mmPorPx) / 10),
    ejeMenorCm: a1((menor * mmPorPx) / 10),
    dCm: diametroCm(e.ancho, e.alto, mmPorPx),
    origen,
    puntosBorde: e.puntos,
  };
}

/** La testa con otro Ø (lo corrigió el operador): la elipse crece o se achica pareja para que se vea. */
export function conDiametro(t: TestaPropuesta, dCm: number, mmPorPx: number): TestaPropuesta {
  const d = Math.max(D_BUSCADO_CM.min / 2, a1(dCm));
  const k = (d * 10) / ((t.aPx + t.bPx) * mmPorPx) || 1;
  return {
    ...t,
    aPx: a1(t.aPx * k),
    bPx: a1(t.bPx * k),
    ejeMayorCm: a1(t.ejeMayorCm * k),
    ejeMenorCm: a1(t.ejeMenorCm * k),
    dCm: d,
    origen: t.origen === "agregada" ? "agregada" : "ajustada",
  };
}

/**
 * El orden en que se leen las testas, como un texto: por filas de arriba
 * abajo y, en cada fila, de izquierda a derecha. Una testa es de la fila si su
 * centro está a menos de un radio (la mediana) del centro de la fila: en una
 * carga apilada la fila siguiente queda a ~1,7 radios.
 */
export function ordenDeLectura<T extends Pick<TestaPropuesta, "cx" | "cy" | "aPx" | "bPx">>(testas: readonly T[]): T[] {
  if (testas.length < 2) return [...testas];
  const radios = testas.map((t) => (t.aPx + t.bPx) / 2).sort((p, q) => p - q);
  const r = radios[Math.floor(radios.length / 2)];
  const filas: T[][] = [];
  for (const t of [...testas].sort((p, q) => p.cy - q.cy)) {
    const ult = filas.at(-1);
    const cy = ult ? ult.reduce((a, x) => a + x.cy, 0) / ult.length : 0;
    if (ult && Math.abs(t.cy - cy) < r) ult.push(t);
    else filas.push([t]);
  }
  return filas.flatMap((f) => f.sort((p, q) => p.cx - q.cx));
}

/** Lo que el worker devuelve de una cara medida. */
export interface CaraMedida {
  cara: "atras" | "adelante";
  mmPorPx: number;
  /** El tamaño de la foto enderezada (px). */
  ancho: number;
  alto: number;
  hojasLeidas: 1 | 2;
  ladoHojaPx: number[];
  testas: TestaPropuesta[];
}

/** ¿Alguna hoja salió chica en la foto? (Ø ~1 cm corto: acercarse o hacer zoom óptico.) */
export const hojaChica = (cara: Pick<CaraMedida, "ladoHojaPx">): boolean => cara.ladoHojaPx.some((l) => l < LADO_MIN_HOJA_PX);

/** Una troza de la carga en la tabla: lo que dio la foto y lo que tipeó el operador. */
export interface FilaPorFoto {
  codigo: string;
  especie: string | null;
  d1Cm: number | null;
  /** `null` = no se midió la otra punta: va pareja (D2 = D1, ADR-492) y se marca. */
  d2Cm: number | null;
  largoM: number | null;
  origenD1: "foto" | "mano";
  origenD2: "foto" | "mano" | null;
  testaAtras: string | null;
  testaAdelante: string | null;
  /** La punta de adelante que le tocó está para revisar (`emparejarCaras`: se corre mucho, otro Ø o le faltó pareja). */
  parejaDudosa?: boolean;
}

/** Lo que el operador corrigió en la tabla, por testa. */
export interface CorreccionesDeLaCarga {
  d1Cm?: Readonly<Record<string, number | null>>;
  d2Cm?: Readonly<Record<string, number | null>>;
  largoM?: Readonly<Record<string, number | null>>;
}

/** La cara de adelante ya emparejada con la de atrás (F2): sus testas y la pareja de cada troza. */
export interface CaraDeAdelante {
  testas: readonly TestaPropuesta[];
  parejas: readonly ParejaDeCaras[];
}

/**
 * Las filas de la tabla, una por testa de ATRÁS en orden de lectura, con el
 * código que imprimirá la guía (`codigos`, en el mismo orden:
 * `codigosDeLaCarga`). El largo y la especie son de toda la carga, y cada fila
 * puede corregirlos. Con la cara de adelante, D2 es el Ø de su punta
 * (`emparejarCaras`); sin ella o sin pareja, D2 queda vacío (pareja, D2 = D1).
 */
export function filasDeLaCarga(
  testas: readonly TestaPropuesta[],
  codigos: readonly string[],
  carga: { largoM: number | null; especie: string | null },
  correcciones: CorreccionesDeLaCarga = {},
  adelante?: CaraDeAdelante,
): FilaPorFoto[] {
  const punta = new Map(adelante?.testas.map((t) => [t.id, t]));
  const pareja = new Map(adelante?.parejas.map((p) => [p.atras, p]));
  return testas.map((t, i) => {
    const d1 = correcciones.d1Cm?.[t.id];
    const d2 = correcciones.d2Cm?.[t.id];
    const largo = correcciones.largoM?.[t.id];
    const p = pareja.get(t.id);
    const frente = p?.adelante != null ? punta.get(p.adelante) : undefined;
    return {
      codigo: codigos[i] ?? String(i + 1),
      especie: carga.especie?.trim() || null,
      d1Cm: d1 !== undefined ? d1 : t.dCm,
      d2Cm: d2 !== undefined ? d2 : (frente?.dCm ?? null),
      largoM: largo !== undefined ? largo : carga.largoM,
      origenD1: d1 !== undefined ? "mano" : "foto",
      origenD2: d2 != null ? "mano" : d2 === undefined && frente ? "foto" : null,
      testaAtras: t.id,
      testaAdelante: frente?.id ?? null,
      ...(adelante ? { parejaDudosa: !p || p.dudosa } : {}),
    };
  });
}

export type CampoQueFalta = "d1" | "d2" | "largo" | "especie";

/** Lo que pasa a «Anotar a mano»: una fila por troza, cantidad 1, marcada «medido por foto». */
export type TrozaPorFoto = TrozaAMano & { medidoPorFoto: true };

/**
 * Las filas listas para «Anotar a mano» y, por código, qué falta o está fuera
 * de rango (las mismas reglas que la fila de alta: `trozaAManoSchema`). D2
 * vacío NO falta: la troza va pareja (D2 = D1) con la marca `d2Supuesto`.
 */
export function aTrozasAMano(filas: readonly FilaPorFoto[]): { listas: TrozaPorFoto[]; faltan: { codigo: string; campo: CampoQueFalta }[] } {
  const listas: TrozaPorFoto[] = [];
  const faltan: { codigo: string; campo: CampoQueFalta }[] = [];
  const CAMPO: Record<string, CampoQueFalta> = { d1Cm: "d1", d2Cm: "d2", largoM: "largo", especie: "especie" };
  for (const f of filas) {
    const antes = faltan.length;
    if (!f.especie) faltan.push({ codigo: f.codigo, campo: "especie" });
    if (f.d1Cm == null) faltan.push({ codigo: f.codigo, campo: "d1" });
    if (f.largoM == null) faltan.push({ codigo: f.codigo, campo: "largo" });
    if (faltan.length > antes || f.d1Cm == null || f.largoM == null) continue;
    const d2Supuesto = f.d2Cm == null;
    const r = trozaAManoSchema.safeParse({ d1Cm: f.d1Cm, d2Cm: f.d2Cm ?? f.d1Cm, largoM: f.largoM, cantidad: 1, especie: f.especie });
    if (!r.success) {
      /* Pareja: el D2 es el mismo D1, el error es del D1 (la celda D2 está vacía). */
      const campos = new Set(r.error.issues.map((i) => CAMPO[String(i.path[0])] ?? "d1").map((c) => (d2Supuesto && c === "d2" ? "d1" : c)));
      for (const campo of campos) faltan.push({ codigo: f.codigo, campo });
      continue;
    }
    /* El libro guarda D1 = la punta mayor y D2 = la menor (`medidasDelLibro`): la de atrás puede ser la fina. */
    const [mayor, menor] = r.data.d1Cm >= r.data.d2Cm ? [r.data.d1Cm, r.data.d2Cm] : [r.data.d2Cm, r.data.d1Cm];
    listas.push({ ...r.data, d1Cm: mayor, d2Cm: menor, medidoPorFoto: true, ...(d2Supuesto ? { d2Supuesto: true } : {}) });
  }
  return { listas, faltan };
}

/**
 * El código que la guía imprimirá a cada troza de la foto: las de la foto van
 * DETRÁS de lo ya anotado a mano, con la misma numeración que la guía
 * (`piezasAMano`, desde `desde` y saltando los códigos del libro). Una sola
 * regla: lo que dice la tabla es lo que sale en el papel.
 */
export function codigosDeLaCarga(
  previas: readonly TrozaAMano[],
  nuevas: number,
  x: { ocupados: Iterable<string>; arboles?: ReadonlyMap<string, ArbolParaNumerar>; desde?: number },
): string[] {
  const relleno: TrozaAMano = { d1Cm: 30, d2Cm: 30, largoM: 1, cantidad: 1 };
  const piezas = piezasAMano([...previas, ...Array.from({ length: nuevas }, () => relleno)], x.ocupados, x.arboles, x.desde);
  return piezas.slice(trozasDeFilas(previas)).map((p) => p.codigo);
}

/** Trozas y m³ de las filas completas (el volumen del libro: `volumenPorTroza`, Ø y largo ya redondeados). */
export function resumenDeLaCarga(filas: readonly FilaPorFoto[]): { trozas: number; volumenM3: number } {
  let v = 0;
  for (const f of filas) {
    if (f.d1Cm == null || f.largoM == null) continue;
    v += volumenPorTroza({ d1Cm: f.d1Cm, d2Cm: f.d2Cm ?? f.d1Cm, largoM: f.largoM });
  }
  return { trozas: filas.length, volumenM3: Math.round(v * 10000) / 10000 };
}

/** Hasta qué número se cree un código de la guía como correlativo (más largo es una fecha o un N° pegado). */
export const CORRELATIVO_MAX = 99999;

/**
 * El N° que sigue por permiso: el mayor código NUMÉRICO que imprime la guía
 * (`codigoDeLaGuia`: «23-0123» → 23; «001-TOR-A» no cuenta) + 1, por plan.
 * Clave `sin_permiso` = las trozas sin plan. Un permiso sin trozas numeradas
 * no tiene clave (la pantalla empieza en 1).
 */
export function siguientesCorrelativos(trozas: readonly { planId: string | null; trozaCode: string | null }[]): Record<string, number> {
  const mayor: Record<string, number> = {};
  for (const t of trozas) {
    if (!t.trozaCode) continue;
    const cod = codigoDeLaGuia(t.trozaCode);
    if (!/^\d{1,5}$/.test(cod)) continue;
    const n = Number(cod);
    const clave = t.planId ?? "sin_permiso";
    if (n >= 1 && n <= CORRELATIVO_MAX && n > (mayor[clave] ?? 0)) mayor[clave] = n;
  }
  return Object.fromEntries(Object.entries(mayor).map(([k, n]) => [k, Math.min(CORRELATIVO_MAX, n + 1)]));
}

/* ─────────── Las dos caras de la carga (F2, Brandon 16-10: «D2 por la otra cara») ─────────── */

/** Una troza de la cara de atrás y su punta en la cara de adelante. */
export interface ParejaDeCaras {
  atras: string;
  /** `null` = su punta no salió en la foto de adelante (la fila queda pareja, D2 = D1). */
  adelante: string | null;
  /** Cuánto se aparta su punta de donde la espera la de atrás, tras alinear las dos caras (mm). */
  corridoMm: number | null;
  /** Para revisar: se aparta mucho, los Ø no se parecen o le faltó pareja. */
  dudosa: boolean;
  /** La puso el operador («esta de adelante es la N° 7»). */
  fija: boolean;
}

export interface CarasEmparejadas {
  /** Una por testa de atrás, en su orden. */
  parejas: ParejaDeCaras[];
  /** Testas de adelante sin troza de atrás (sobran o faltó una atrás). */
  sueltas: string[];
}

type CaraParaEmparejar = Pick<CaraMedida, "mmPorPx" | "testas">;
interface PuntaEnMm {
  id: string;
  x: number;
  y: number;
  /** Radio medio (mm) y Ø (cm). */
  r: number;
  d: number;
}
/** Giro + traslado que lleva la cara de adelante (espejada) sobre la de atrás. */
interface Rigida {
  c: number;
  s: number;
  tx: number;
  ty: number;
}

const mover = (T: Rigida, b: PuntaEnMm): [number, number] => [T.c * b.x - T.s * b.y + T.tx, T.s * b.x + T.c * b.y + T.ty];
const diferencia = (a: PuntaEnMm, [x, y]: [number, number]): [number, number] => [a.x - x, a.y - y];

/**
 * La asignación de menor costo de una matriz cuadrada (método húngaro, O(n³),
 * con potenciales): `fila → columna`. Propio: 40 líneas no justifican un paquete.
 */
export function asignacionMinima(costo: readonly (readonly number[])[]): number[] {
  const n = costo.length;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const fila = new Array<number>(n + 1).fill(0);
  const via = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    fila[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(Infinity);
    const usada = new Array<boolean>(n + 1).fill(false);
    do {
      usada[j0] = true;
      const i0 = fila[j0]!;
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (usada[j]) continue;
        const c = costo[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (c < minv[j]!) {
          minv[j] = c;
          via[j] = j0;
        }
        if (minv[j]! < delta) {
          delta = minv[j]!;
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (usada[j]) {
          u[fila[j]!]! += delta;
          v[j]! -= delta;
        } else minv[j]! -= delta;
      }
      j0 = j1;
    } while (fila[j0] !== 0);
    do {
      const j1 = via[j0]!;
      fila[j0] = fila[j1]!;
      j0 = j1;
    } while (j0);
  }
  const out = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j++) if (fila[j]! > 0) out[fila[j]! - 1] = j - 1;
  return out;
}

/** El giro + traslado que mejor lleva `b` sobre `a` (mínimos cuadrados, Kabsch en 2D). Con una sola pareja, sólo traslado. */
function alinear(pares: readonly { a: PuntaEnMm; b: PuntaEnMm }[], giro: Rigida): Rigida {
  const n = pares.length;
  const ax = pares.reduce((t, p) => t + p.a.x, 0) / n;
  const ay = pares.reduce((t, p) => t + p.a.y, 0) / n;
  const bx = pares.reduce((t, p) => t + p.b.x, 0) / n;
  const by = pares.reduce((t, p) => t + p.b.y, 0) / n;
  let { c, s } = giro;
  if (n >= 3) {
    let sxx = 0;
    let sxy = 0;
    for (const { a, b } of pares) {
      const [qx, qy, px, py] = [b.x - bx, b.y - by, a.x - ax, a.y - ay];
      sxx += qx * px + qy * py;
      sxy += qx * py - qy * px;
    }
    const th = Math.atan2(sxy, sxx);
    /* Las hojas se pegan derechas a ojo: un giro de más de 25° es un mal emparejado, no la carga. */
    if (Math.abs(th) <= (25 * Math.PI) / 180) [c, s] = [Math.cos(th), Math.sin(th)];
  }
  return { c, s, tx: ax - (c * bx - s * by), ty: ay - (s * bx + c * by) };
}

/** Ø de las dos puntas: hasta un 20 % de diferencia es la conicidad; más allá, cuesta (2 mm por mm de más). */
const DIFERENCIA_D = 0.2;
/** Más corrida que esto (× el radio) la pareja queda para revisar. */
const CORRIDO_DUDOSO = 0.45;

/**
 * Empareja cada troza de la cara de ATRÁS con su punta en la de ADELANTE. La
 * foto de adelante se toma del otro lado: es la carga ESPEJADA (izquierda ↔
 * derecha). Las dos están en mm por sus hojas de escala, así que basta
 * espejar adelante, girarla un poco (cada hoja se pega a ojo) y correrla: se
 * prueban 5 giros de partida y en cada uno se alterna la asignación de menor
 * costo (distancia + Ø muy distinto, `asignacionMinima`) con el giro que mejor
 * calza las parejas buenas (`alinear`), hasta que no cambie.
 *
 * Distinta cantidad de testas: las que sobran quedan sin pareja (costo fijo de
 * casi un radio cada una) y se marcan. Las que fijó el operador (`fijas`: atrás → adelante)
 * no se tocan; cada giro se prueba alineando con ellas y sin ellas y gana el de
 * menor costo: una bien fijada endereza las demás y una fijada por error no
 * las desarma (sólo quedan sueltas las dos que tocó).
 */
export function emparejarCaras(
  atras: CaraParaEmparejar,
  adelante: CaraParaEmparejar,
  fijas: Readonly<Record<string, string | null>> = {},
): CarasEmparejadas {
  const enMm = (cara: CaraParaEmparejar, espejo: 1 | -1): PuntaEnMm[] =>
    cara.testas.map((t) => ({ id: t.id, x: espejo * t.cx * cara.mmPorPx, y: t.cy * cara.mmPorPx, r: ((t.aPx + t.bPx) / 2) * cara.mmPorPx, d: t.dCm }));
  const A = enMm(atras, 1);
  const B = enMm(adelante, -1);
  const porIdB = new Map(B.map((b) => [b.id, b]));
  /* Lo fijado por el operador: cada punta de adelante, a una sola de atrás. */
  const fija = new Map<string, string | null>();
  const tomadas = new Set<string>();
  for (const a of A) {
    if (!(a.id in fijas)) continue;
    const b = fijas[a.id] ?? null;
    if (b != null && (!porIdB.has(b) || tomadas.has(b))) continue;
    fija.set(a.id, b);
    if (b != null) tomadas.add(b);
  }
  const anclas = A.flatMap((a) => {
    const b = fija.get(a.id);
    return b ? [{ a, b: porIdB.get(b)! }] : [];
  });
  const libresA = A.filter((a) => !fija.has(a.id));
  const libresB = B.filter((b) => !tomadas.has(b.id));
  const radios = [...A, ...B].map((p) => p.r).sort((p, q) => p - q);
  const rTipico = radios[Math.floor(radios.length / 2)] ?? 150;
  const sinPareja = 0.9 * rTipico;
  const costo = (a: PuntaEnMm, b: PuntaEnMm, T: Rigida): number => {
    const [x, y] = mover(T, b);
    const exceso = Math.max(0, Math.abs(a.d - b.d) - DIFERENCIA_D * Math.max(a.d, b.d));
    return Math.hypot(a.x - x, a.y - y) + 20 * exceso;
  };
  const centro = (ps: readonly PuntaEnMm[]): [number, number] =>
    ps.length ? [ps.reduce((t, p) => t + p.x, 0) / ps.length, ps.reduce((t, p) => t + p.y, 0) / ps.length] : [0, 0];

  let mejor: { total: number; asig: (number | null)[]; T: Rigida } | null = null;
  /* Cuadrada de (atrás + adelante): cada una puede quedar sin pareja por `sinPareja`; dos sueltas cuestan
     lo mismo que una pareja a 1,8 radios (con igual cantidad, una troza muy corrida igual se empareja). */
  const [nA, nB] = [libresA.length, libresB.length];
  const n = nA + nB;
  const arranques = (nA && nB ? [0, -8, 8, -16, 16] : []).flatMap((grados) => (anclas.length ? [{ grados, ayudan: anclas }, { grados, ayudan: [] }] : [{ grados, ayudan: [] }]));
  for (const { grados, ayudan } of arranques) {
    const th = (grados * Math.PI) / 180;
    const giro = { c: Math.cos(th), s: Math.sin(th), tx: 0, ty: 0 };
    let T: Rigida;
    if (ayudan.length) T = alinear(ayudan, giro);
    else {
      const [ax, ay] = centro(A);
      const [bx, by] = centro(B);
      T = { ...giro, tx: ax - (giro.c * bx - giro.s * by), ty: ay - (giro.s * bx + giro.c * by) };
    }
    let asig: (number | null)[] = [];
    let total = Infinity;
    for (let vuelta = 0; vuelta < 10; vuelta++) {
      const M = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i < nA && j < nB ? costo(libresA[i]!, libresB[j]!, T) : i >= nA && j >= nB ? 0 : sinPareja)),
      );
      const cols = asignacionMinima(M);
      const nueva = libresA.map((_, i) => (cols[i]! < nB ? cols[i]! : null));
      total = cols.reduce((t, j, i) => t + M[i]![j]!, 0);
      const igual = nueva.every((j, i) => j === asig[i]);
      asig = nueva;
      if (igual) break;
      /* Se alinea con las parejas que ya calzan (menos de medio radio) y las del operador. */
      const buenas = [
        ...ayudan,
        ...libresA.flatMap((a, i) => {
          const j = asig[i];
          return j != null && M[i]![j]! < 0.5 * Math.min(a.r, libresB[j]!.r) ? [{ a, b: libresB[j]! }] : [];
        }),
      ];
      if (!buenas.length) break;
      T = alinear(buenas, T);
    }
    if (!mejor || total < mejor.total) mejor = { total, asig, T };
  }

  const usadas = new Set(tomadas);
  const libre = new Map(libresA.map((a, i) => [a.id, mejor?.asig[i] ?? null]));
  const parejas = A.map((a): ParejaDeCaras => {
    if (fija.has(a.id)) {
      const b = fija.get(a.id) ?? null;
      const corrido = b && mejor ? Math.round(Math.hypot(...diferencia(a, mover(mejor.T, porIdB.get(b)!)))) : null;
      return { atras: a.id, adelante: b, corridoMm: corrido, dudosa: false, fija: true };
    }
    const j = libre.get(a.id);
    if (j == null || !mejor) return { atras: a.id, adelante: null, corridoMm: null, dudosa: true, fija: false };
    const b = libresB[j]!;
    usadas.add(b.id);
    const corrido = Math.hypot(...diferencia(a, mover(mejor.T, b)));
    const otroD = Math.abs(a.d - b.d) > DIFERENCIA_D * Math.max(a.d, b.d);
    return { atras: a.id, adelante: b.id, corridoMm: Math.round(corrido), dudosa: corrido > CORRIDO_DUDOSO * Math.min(a.r, b.r) || otroD, fija: false };
  });
  return { parejas, sueltas: B.filter((b) => !usadas.has(b.id)).map((b) => b.id) };
}
