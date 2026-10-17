/**
 * La medición de las testas con OpenCV (16-10, «Medir por foto», F1). Sin DOM:
 * recibe `cv` y una foto en gris, así corre igual en el worker del navegador
 * (`testas.worker.ts`) y en el banco de Node (el prototipo del carril K, con
 * `@techstark/opencv-js`, la misma 5.0.0-release.1 de `public/opencv`).
 *
 * 1. Lee las hojas de escala (ArUco 248/249, `IDS_HOJA_ESCALA`) y endereza la
 *    cara de la carga con su homografía (`marcoEnderezado`, ≥1,5 mm por px).
 * 2. Propone círculos (Hough ALT) del tamaño que puede tener una troza.
 * 3. En cada uno, 144 rayos buscan el borde de la madera (los escalones de
 *    claro a oscuro) y una elipse se ajusta a esos puntos, en 3 pasadas que
 *    descartan los que se alejan (grietas, la correa). Compiten la de los
 *    escalones más fuertes y la guiada por el círculo: gana la que más rayos
 *    sostienen (`elipseDeCirculo`).
 * 4. Desde ese borde, los mismos rayos buscan el de AFUERA de la corteza
 *    (`gruesoDeCorteza`): el Ø va CON corteza (Brandon 16-10). Si no la ven,
 *    la troza está descortezada y vale el borde de la madera.
 * 5. Ø = promedio de los dos ejes, en mm por la escala de la hoja.
 *
 * La máquina PROPONE: cada Ø lo confirma el operador en la tabla (regla
 * forestal). Banco 16-10 con corteza (`scripts/testas-banco.ts`, 40 caras
 * sintéticas, 460 trozas, corteza de 1 a 3 cm y 18 % descortezadas): ver la
 * cabecera del banco para las cifras de antes y después.
 */
import {
  escalaDeLasHojas,
  esIdHojaEscala,
  marcoEnderezado,
  ordenDeLectura,
  radiosBuscados,
  testaDeElipse,
  type CaraMedida,
  type ElipseCruda,
  type HojaLeida,
  type MarcoEnderezado,
  type TestaPropuesta,
} from "@/lib/forestal/testas-medicion";

/** Lo mínimo de OpenCV.js que se usa (los tipos del paquete pesan y no entran al worker). */
export interface MatCv {
  rows: number;
  cols: number;
  data: Uint8Array;
  data32F: Float32Array;
  data32S: Int32Array;
  delete(): void;
}
interface MatVectorCv {
  size(): number;
  get(i: number): MatCv;
  delete(): void;
}
export interface OpenCvTestas {
  Mat: { new (): MatCv; new (rows: number, cols: number, type: number): MatCv };
  MatVector: new () => MatVectorCv;
  Size: new (w: number, h: number) => unknown;
  Scalar: new (...v: number[]) => unknown;
  CV_8UC1: number;
  CV_32FC2: number;
  CV_64F: number;
  INTER_LINEAR: number;
  BORDER_CONSTANT: number;
  HOUGH_GRADIENT_ALT: number;
  matFromArray(rows: number, cols: number, type: number, datos: ArrayLike<number>): MatCv;
  warpPerspective(src: MatCv, dst: MatCv, M: MatCv, tam: unknown, flags: number, borde: number, valor: unknown): void;
  medianBlur(src: MatCv, dst: MatCv, k: number): void;
  GaussianBlur(src: MatCv, dst: MatCv, k: unknown, sigma: number): void;
  HoughCircles(img: MatCv, out: MatCv, metodo: number, dp: number, minDist: number, p1: number, p2: number, rMin: number, rMax: number): void;
  fitEllipse(pts: MatCv): { center: { x: number; y: number }; size: { width: number; height: number }; angle: number };
  DICT_4X4_250: number;
  getPredefinedDictionary(d: number): unknown;
  aruco_DetectorParameters: new () => { errorCorrectionRate: number; cornerRefinementMethod: number };
  aruco_RefineParameters: new (a: number, b: number, c: boolean) => unknown;
  aruco_ArucoDetector: new (
    dict: unknown,
    params: unknown,
    refine: unknown,
  ) => { detectMarkers(img: MatCv, corners: MatVectorCv, ids: MatCv, rejected: MatVectorCv): void };
}

export type DetectorHojas = InstanceType<OpenCvTestas["aruco_ArucoDetector"]>;

/** Rayos por testa y el escalón mínimo (niveles de gris) que cuenta como borde. */
const RAYOS = 144;
const ESCALON_MIN = 25;
/** Una elipse necesita al menos esta parte de los rayos para ser propuesta sola. */
const PUNTOS_MIN = 30;
/** Más alargada que esto no es una testa (es una grieta, una sombra o dos testas). */
const ALARGADA_MAX = 1.5;
/** Alrededor de la hoja no se buscan testas (el papel blanco y el marcador engañan). */
const MARGEN_HOJA_MM = 120;
/**
 * La corteza (Brandon 16-10: el Ø va CON corteza, de 1 a 3 cm de grueso): se
 * busca su borde de afuera entre 4 y 45 mm más allá del de la madera, con un
 * escalón más suave que el de la madera (de corteza a sombra hay menos
 * contraste), y cuenta si la ve al menos esta parte de los rayos.
 */
const CORTEZA_MM = { min: 4, max: 45 } as const;
const ESCALON_CORTEZA = 10;
const CORTEZA_RAYOS_MIN = 0.3;

export function crearDetectorHojas(cv: OpenCvTestas): DetectorHojas {
  const params = new cv.aruco_DetectorParameters();
  /* 0 = el código entero: mejor no leer la hoja que leer otro número. */
  params.errorCorrectionRate = 0;
  /* 1 = esquinas subpíxel: con esquinas enteras (±0,5 px en un lado de 200) la
     perspectiva de UNA hoja se estira a 3 m y el Ø salía +1,6 cm (banco 16-10). */
  params.cornerRefinementMethod = 1;
  return new cv.aruco_ArucoDetector(cv.getPredefinedDictionary(cv.DICT_4X4_250), params, new cv.aruco_RefineParameters(10, 3, true));
}

/** Los marcadores de la foto (todos: los que no son hoja de escala se informan aparte). */
export function leerMarcadores(cv: OpenCvTestas, gris: MatCv, detector: DetectorHojas): HojaLeida[] {
  const esquinas = new cv.MatVector();
  const ids = new cv.Mat();
  const rechazados = new cv.MatVector();
  try {
    detector.detectMarkers(gris, esquinas, ids, rechazados);
    const out: HojaLeida[] = [];
    /* En la 5.0 `ids` es 1×N: se recorre entero, no por filas. */
    for (let i = 0; i < ids.rows * ids.cols; i++) {
      const c = esquinas.get(i);
      const p = c.data32F;
      out.push({ id: ids.data32S[i]!, esquinas: [0, 1, 2, 3].map((k) => [p[2 * k]!, p[2 * k + 1]!] as const) });
      c.delete();
    }
    return out;
  } finally {
    esquinas.delete();
    ids.delete();
    rechazados.delete();
  }
}

/** La foto (gris o color) enderezada al marco. El que llama la borra. */
export function enderezar(cv: OpenCvTestas, src: MatCv, marco: MarcoEnderezado, fondo = 0): MatCv {
  const M = cv.matFromArray(3, 3, cv.CV_64F, [...marco.M]);
  const out = new cv.Mat();
  try {
    cv.warpPerspective(src, out, M, new cv.Size(marco.ancho, marco.alto), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar(fondo, fondo, fondo, 255));
    return out;
  } finally {
    M.delete();
  }
}

/** Una imagen en gris para muestrear con interpolación (la suavizada). */
export interface Muestreable {
  data: Uint8Array;
  cols: number;
  rows: number;
}

export function muestreador({ data, cols: W, rows: H }: Muestreable) {
  return (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= W - 1 || yi >= H - 1) return 0;
    const fx = x - xi;
    const fy = y - yi;
    const i = yi * W + xi;
    return (
      data[i]! * (1 - fx) * (1 - fy) + data[i + 1]! * fx * (1 - fy) + data[i + W]! * (1 - fx) * fy + data[i + W + 1]! * fx * fy
    );
  };
}

/** Un rayo desde el centro propuesto: su dirección y sus escalones de claro a oscuro (distancia en px), del más fuerte al más débil. */
export interface Rayo {
  co: number;
  si: number;
  ts: number[];
}

/** En cada rayo, hasta 3 escalones de claro a oscuro entre `desde` y `hasta` px (mínimos locales, separados ≥ 3 px). */
function rayosConEscalones(img: Muestreable, cx: number, cy: number, desde: number, hasta: number): Rayo[] {
  const at = muestreador(img);
  const rayos: Rayo[] = [];
  for (let k = 0; k < RAYOS; k++) {
    const th = (k * 2 * Math.PI) / RAYOS;
    const co = Math.cos(th);
    const si = Math.sin(th);
    const perfil: { t: number; dv: number }[] = [];
    for (let t = Math.max(2, desde); t <= hasta; t += 0.5) {
      perfil.push({ t, dv: at(cx + (t + 2) * co, cy + (t + 2) * si) - at(cx + (t - 2) * co, cy + (t - 2) * si) });
    }
    const minimos = perfil
      .filter((p, i) => p.dv < -ESCALON_MIN && p.dv <= (perfil[i - 1]?.dv ?? 0) && p.dv <= (perfil[i + 1]?.dv ?? 0))
      .sort((p, q) => p.dv - q.dv);
    const ts: number[] = [];
    for (const m of minimos) {
      if (ts.length < 3 && ts.every((t) => Math.abs(t - m.t) >= 3)) ts.push(m.t);
    }
    rayos.push({ co, si, ts });
  }
  return rayos;
}

/** Los puntos del borde: en cada rayo, el escalón más fuerte. */
const masFuertes = (rayos: readonly Rayo[], cx: number, cy: number): [number, number][] =>
  rayos.flatMap((r) => (r.ts.length ? [[cx + r.ts[0]! * r.co, cy + r.ts[0]! * r.si] as [number, number]] : []));


/** Cuánto anda el rayo desde (ox, oy) hasta el borde de la elipse (`null` = no la cruza). */
export function hastaLaElipse(e: ElipseCruda, ox: number, oy: number, co: number, si: number): number | null {
  const f = (e.angulo * Math.PI) / 180;
  const [cf, sf] = [Math.cos(f), Math.sin(f)];
  const [a2, b2] = [(e.ancho / 2) ** 2, (e.alto / 2) ** 2];
  const [px, py] = [(ox - e.cx) * cf + (oy - e.cy) * sf, -(ox - e.cx) * sf + (oy - e.cy) * cf];
  const [ux, uy] = [co * cf + si * sf, -co * sf + si * cf];
  const A = ux * ux / a2 + uy * uy / b2;
  const B = 2 * (px * ux / a2 + py * uy / b2);
  const C = px * px / a2 + py * py / b2 - 1;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = (-B + Math.sqrt(disc)) / (2 * A);
  return t > 0 ? t : null;
}

/** En cada rayo, el escalón más cerca de donde la elipse dice que está el borde (si está a menos de `tol` px). */
export function bordeGuiado(rayos: readonly Rayo[], ox: number, oy: number, e: ElipseCruda, tol: number): [number, number][] {
  const pts: [number, number][] = [];
  for (const r of rayos) {
    const esperado = hastaLaElipse(e, ox, oy, r.co, r.si);
    if (esperado == null) continue;
    let mejor: number | null = null;
    for (const t of r.ts) if (Math.abs(t - esperado) <= tol && (mejor == null || Math.abs(t - esperado) < Math.abs(mejor - esperado))) mejor = t;
    if (mejor != null) pts.push([ox + mejor * r.co, oy + mejor * r.si]);
  }
  return pts;
}

/** Cuántos rayos tienen un escalón sobre el borde de la elipse (± 2 px o 3 % del radio): lo que la sostiene. */
function apoyo(rayos: readonly Rayo[], ox: number, oy: number, e: ElipseCruda): number {
  const tol = Math.max(2, 0.03 * ((e.ancho + e.alto) / 4));
  return rayos.filter((r) => {
    const esperado = hastaLaElipse(e, ox, oy, r.co, r.si);
    return esperado != null && r.ts.some((t) => Math.abs(t - esperado) <= tol);
  }).length;
}

/**
 * La testa de un círculo de Hough. El escalón más fuerte de cada rayo a veces
 * es la correa, una grieta o el borde de la vecina, y la elipse sale corrida y
 * chica (banco 16-10: 2 de 14 trozas −2,5 cm bajo la correa). Por eso hay dos
 * candidatas —la de los escalones más fuertes y la guiada por el círculo, que
 * en cada rayo toma el escalón más cerca de donde lo espera— y queda la que
 * más rayos sostienen. Empate: la de los más fuertes (lo de antes).
 */
function elipseDeCirculo(cv: OpenCvTestas, suave: Muestreable, c: { x: number; y: number; r: number }): ElipseCruda | null {
  const rayos = rayosConEscalones(suave, c.x, c.y, 0.6 * c.r, 1.4 * c.r);
  const fuerte = elipseRobusta(cv, masFuertes(rayos, c.x, c.y));
  let guiada: ElipseCruda | null = { cx: c.x, cy: c.y, ancho: 2 * c.r, alto: 2 * c.r, angulo: 0, puntos: 0 };
  for (let vuelta = 0; vuelta < 2 && guiada; vuelta++) {
    guiada = elipseRobusta(cv, bordeGuiado(rayos, c.x, c.y, guiada, Math.max(3, 0.15 * c.r)));
  }
  if (!guiada) return fuerte;
  if (!fuerte) return guiada;
  return apoyo(rayos, c.x, c.y, guiada) > apoyo(rayos, c.x, c.y, fuerte) ? guiada : fuerte;
}

/** La elipse de esos puntos, en 3 pasadas que sueltan los que quedan lejos (> 3× la mediana). */
export function elipseRobusta(cv: OpenCvTestas, puntos: [number, number][]): ElipseCruda | null {
  let pts = puntos;
  let el: ReturnType<OpenCvTestas["fitEllipse"]> | null = null;
  for (let vuelta = 0; vuelta < 3 && pts.length >= 12; vuelta++) {
    const m = cv.matFromArray(pts.length, 1, cv.CV_32FC2, pts.flat());
    try {
      el = cv.fitEllipse(m);
    } finally {
      m.delete();
    }
    const a = el.size.width / 2;
    const b = el.size.height / 2;
    const f = (el.angle * Math.PI) / 180;
    const { x: ex, y: ey } = el.center;
    const res = pts.map(([x, y]) => {
      const dx = x - ex;
      const dy = y - ey;
      const th = Math.atan2(dy, dx) - f;
      return Math.hypot(dx, dy) - (a * b) / Math.hypot(b * Math.cos(th), a * Math.sin(th));
    });
    const abs = res.map(Math.abs).sort((p, q) => p - q);
    const med = abs[Math.floor(abs.length / 2)] ?? 0;
    pts = pts.filter((_, i) => Math.abs(res[i]!) <= Math.max(2, 3 * med));
  }
  if (!el || !(el.size.width > 0 && el.size.height > 0)) return null;
  return { cx: el.center.x, cy: el.center.y, ancho: el.size.width, alto: el.size.height, angulo: el.angle, puntos: pts.length };
}

export const alargada = (e: ElipseCruda): boolean => Math.max(e.ancho, e.alto) / Math.min(e.ancho, e.alto) > ALARGADA_MAX;

/**
 * El grueso medio de la corteza (px) alrededor de la elipse de la MADERA; 0 =
 * descortezada. En cada rayo, desde el borde de la madera hacia afuera, el
 * escalón de claro a oscuro más fuerte entre 4 y 45 mm es el borde de afuera
 * de la corteza (más oscura que la madera, más clara que la sombra entre
 * trozas). El perfil arranca ANTES del borde de la madera: así su cola no pasa
 * por un escalón. La corteza no es pareja (±50 %): se sueltan los gruesos
 * lejos de la mediana (el borde de la vecina, una mancha) y queda el promedio
 * del resto. (Ajustar una elipse a esos puntos salió peor en el banco: peor
 * troza 4,8 cm contra 2,4.)
 */
export function gruesoDeCorteza(img: Muestreable, e: ElipseCruda, mmPorPx: number): number {
  const at = muestreador(img);
  const [desde, hasta] = [CORTEZA_MM.min / mmPorPx, CORTEZA_MM.max / mmPorPx];
  const gruesos: number[] = [];
  let rayos = 0;
  for (let k = 0; k < RAYOS; k++) {
    const th = (k * 2 * Math.PI) / RAYOS;
    const [co, si] = [Math.cos(th), Math.sin(th)];
    const t0 = hastaLaElipse(e, e.cx, e.cy, co, si);
    if (t0 == null) continue;
    rayos++;
    const perfil: { g: number; dv: number }[] = [];
    for (let g = -3; g <= hasta + 1; g += 0.5) {
      const t = t0 + g;
      perfil.push({ g, dv: at(e.cx + (t + 1.5) * co, e.cy + (t + 1.5) * si) - at(e.cx + (t - 1.5) * co, e.cy + (t - 1.5) * si) });
    }
    let mejor: { g: number; dv: number } | null = null;
    for (let i = 1; i < perfil.length - 1; i++) {
      const p = perfil[i]!;
      if (p.g < desde || p.g > hasta || p.dv >= -ESCALON_CORTEZA) continue;
      if (p.dv > perfil[i - 1]!.dv || p.dv > perfil[i + 1]!.dv) continue;
      if (!mejor || p.dv < mejor.dv) mejor = p;
    }
    if (mejor) gruesos.push(mejor.g);
  }
  const minimo = CORTEZA_RAYOS_MIN * rayos;
  if (!rayos || gruesos.length < minimo) return 0;
  const orden = [...gruesos].sort((p, q) => p - q);
  const med = orden[Math.floor(orden.length / 2)]!;
  const cerca = gruesos.filter((g) => g >= 0.4 * med && g <= 1.8 * med);
  return cerca.length < minimo ? 0 : cerca.reduce((a, g) => a + g, 0) / cerca.length;
}

/** La testa de la elipse de la madera, con su corteza sumada (el Ø del libro es con corteza). */
export function testaConCorteza(img: Muestreable, e: ElipseCruda, mmPorPx: number, id: string, origen: TestaPropuesta["origen"]): TestaPropuesta {
  const g = gruesoDeCorteza(img, e, mmPorPx);
  const t = testaDeElipse({ ...e, ancho: e.ancho + 2 * g, alto: e.alto + 2 * g }, mmPorPx, id, origen);
  return g > 0 ? { ...t, cortezaCm: Math.round(g * mmPorPx) / 10 } : t;
}

export type ResultadoCara =
  | { ok: true; cara: CaraMedida; marco: MarcoEnderezado; enderezada: MatCv; suave: MatCv; otrosIds: number[]; ms: number }
  | { ok: false; motivo: "sin_hoja"; otrosIds: number[] };

/**
 * Mide una cara de la carga. Con `ok`, `enderezada` (gris) y `suave` quedan
 * vivas para dibujar y para «agregar al tocar»: el que llama las borra.
 */
export function medirCara(
  cv: OpenCvTestas,
  gris: MatCv,
  detector: DetectorHojas,
  cara: CaraMedida["cara"] = "atras",
): ResultadoCara {
  const t0 = Date.now();
  const leidas = leerMarcadores(cv, gris, detector);
  const otrosIds = leidas.filter((h) => !esIdHojaEscala(h.id)).map((h) => h.id);
  const escala = escalaDeLasHojas(leidas);
  if (!escala) return { ok: false, motivo: "sin_hoja", otrosIds };
  const marco = marcoEnderezado(escala, { ancho: gris.cols, alto: gris.rows });
  const mm = marco.mmPorPx;
  const enderezada = enderezar(cv, gris, marco);
  const mediana = new cv.Mat();
  const circulos = new cv.Mat();
  const suave = new cv.Mat();
  try {
    cv.medianBlur(enderezada, mediana, 5);
    const r = radiosBuscados(mm);
    cv.HoughCircles(mediana, circulos, cv.HOUGH_GRADIENT_ALT, 1.5, Math.max(8, Math.round(0.8 * r.min)), 300, 0.75, r.min, r.max);
    cv.GaussianBlur(enderezada, suave, new cv.Size(5, 5), 1.5);

    /* La hoja, en px de la enderezada, con margen: ahí no hay trozas. */
    const cajas = escala.hojas.map((h) => {
      const xs = h.esquinasMm.map((p) => (p[0] - marco.origenMm[0]) / mm);
      const ys = h.esquinasMm.map((p) => (p[1] - marco.origenMm[1]) / mm);
      const m = MARGEN_HOJA_MM / mm;
      return { x0: Math.min(...xs) - m, x1: Math.max(...xs) + m, y0: Math.min(...ys) - m, y1: Math.max(...ys) + m };
    });
    const enHoja = (x: number, y: number) => cajas.some((c) => x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1);

    const brutos: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < circulos.cols * circulos.rows; i++) {
      const [x, y, rad] = [circulos.data32F[3 * i]!, circulos.data32F[3 * i + 1]!, circulos.data32F[3 * i + 2]!];
      if (!enHoja(x, y)) brutos.push({ x, y, r: rad });
    }
    /* Una elipse por círculo, y recién después se eligen: Hough a veces propone un
       círculo grande entre 2-3 trozas que, si se elige primero, tapa a las de adentro
       (banco 16-10: 2 de 14 perdidas). */
    const rMedio = (e: ElipseCruda) => (e.ancho + e.alto) / 4;
    const validas: ElipseCruda[] = [];
    for (const c of brutos) {
      const e = elipseDeCirculo(cv, suave, c);
      if (!e || e.puntos < PUNTOS_MIN || alargada(e)) continue;
      if (Math.hypot(e.cx - c.x, e.cy - c.y) > 0.35 * c.r) continue;
      if (rMedio(e) < 0.8 * r.min || rMedio(e) > 1.2 * r.max) continue;
      validas.push(e);
    }
    /* La que encierra a otras dos más chicas no es una testa: es el hueco entre ellas. */
    const sinContenedoras = validas.filter(
      (e) => validas.filter((k) => k !== e && rMedio(k) < 0.7 * rMedio(e) && Math.hypot(k.cx - e.cx, k.cy - e.cy) < 0.8 * rMedio(e)).length < 2,
    );
    /* Las repetidas (dos círculos sobre la misma testa): queda la de más borde visto. */
    const elipses: ElipseCruda[] = [];
    for (const e of [...sinContenedoras].sort((p, q) => q.puntos - p.puntos)) {
      if (!elipses.some((k) => Math.hypot(k.cx - e.cx, k.cy - e.cy) < 0.5 * Math.min(rMedio(k), rMedio(e)))) elipses.push(e);
    }
    /* Las de adelante con otra letra: las dos caras conviven en la misma carga (F2). */
    const letra = cara === "adelante" ? "a" : "t";
    const testas = ordenDeLectura(elipses.map((e, i) => testaConCorteza(suave, e, mm, `${letra}${i}`, "auto"))).map((t, i) => ({ ...t, id: `${letra}${i + 1}` }));
    return {
      ok: true,
      cara: {
        cara,
        mmPorPx: mm,
        ancho: marco.ancho,
        alto: marco.alto,
        hojasLeidas: escala.hojas.length > 1 ? 2 : 1,
        ladoHojaPx: escala.hojas.map((h) => h.ladoPx),
        testas,
      },
      marco,
      enderezada,
      suave,
      otrosIds,
      ms: Date.now() - t0,
    };
  } catch (err) {
    enderezada.delete();
    suave.delete();
    throw err;
  } finally {
    mediana.delete();
    circulos.delete();
  }
}

