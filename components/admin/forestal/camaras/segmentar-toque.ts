/**
 * «Tocar la troza que no ve» (F4, Brandon 16-10): la testa que la foto no vio
 * —barro, sombra dura, tapada en parte por otra, poco contraste— se recorta
 * desde el toque del operador SIN descargar nada: corre en el worker de OpenCV
 * que ya midió la foto (`testas.worker.ts`) y en el banco de Node.
 *
 * 1. 144 rayos desde el toque guardan hasta 4 escalones de claro a oscuro en el
 *    LOGARITMO del gris: la sombra multiplica el gris, así que en logaritmo el
 *    escalón de la madera a la corteza mide lo mismo al sol que a la sombra. El
 *    umbral sale de la foto (una parte del escalón típico alrededor del toque):
 *    así también ve las de poco contraste.
 * 2. Consenso sin azar: cada terna de rayos separados 120° (y 75°/150°, para la
 *    tapada, que muestra sólo un arco) propone un círculo con un escalón de cada
 *    rayo; gana el que más rayos sostienen, del tamaño de una troza y con el
 *    toque adentro (y si adentro hay otro con el mismo centro casi tan
 *    sostenido, ése: la madera dentro de la corteza). El barro, el borde de la sombra o el de la que tapa no forman
 *    un círculo alrededor del toque: quedan solos.
 * 3. La elipse se ajusta a los escalones de ese círculo (guiada, 2 vueltas) y se
 *    le suma la corteza como a las que vio la foto (`testaConCorteza`).
 *
 * Elegido contra un modelo de segmentación por toque (SlimSAM, MobileSAM): ver
 * las cifras en la cabecera de `scripts/testas-banco.ts`.
 */
import { radiosBuscados, type ElipseCruda, type TestaPropuesta } from "@/lib/forestal/testas-medicion";
import { alargada, bordeGuiado, elipseRobusta, muestreador, testaConCorteza, type Muestreable, type OpenCvTestas, type Rayo } from "./testas-cv";

const RAYOS = 144;
/** Escalones que guarda cada rayo (el borde, la corteza, el barro, la vecina…). */
const POR_RAYO = 4;
/** Escalón mínimo en logaritmo del gris (0,05 ≈ 5 % más oscuro) y la parte del típico que cuenta. */
const ESCALON_LOG_MIN = 0.05;
const UMBRAL_RELATIVO = 0.15;
/** Ternas de rayos (el 2.º y el 3.º, contados desde el 1.º): 120° y 75°/150°. */
const TERNAS: readonly (readonly [number, number])[] = [
  [48, 96],
  [30, 60],
];
/** El toque cae adentro: a no más de esta parte del radio del centro (el dedo no apunta al borde). */
const TOQUE_ADENTRO = 0.8;
/** La madera dentro del círculo de afuera de la corteza: radio entre 70 y 97 %, casi el mismo centro y ≥ 75 % del puntaje. */
const MADERA_ADENTRO = { rMin: 0.7, rMax: 0.97, centro: 0.1, puntaje: 0.75 } as const;

interface Circulo {
  x: number;
  y: number;
  r: number;
}

const mediana = (v: number[]): number => {
  const o = [...v].sort((p, q) => p - q);
  return o[Math.floor(o.length / 2)] ?? 0;
};

/**
 * En cada rayo desde el toque, los 4 PRIMEROS escalones de claro a oscuro (en
 * logaritmo) que pasan el umbral, del más cerca al más lejos. Los primeros y no
 * los más fuertes: el borde de la troza tocada es de lo primero que cruza el
 * rayo, y lo más fuerte suele estar más allá (el lado de afuera de las
 * vecinas, la hoja) y arma un círculo gigante que las abraza a todas.
 */
export function rayosDesdeElToque(img: Muestreable, ox: number, oy: number, desde: number, hasta: number): Rayo[] {
  const at = muestreador(img);
  const crudos: { co: number; si: number; min: { t: number; dv: number }[] }[] = [];
  for (let k = 0; k < RAYOS; k++) {
    const th = (k * 2 * Math.PI) / RAYOS;
    const co = Math.cos(th);
    const si = Math.sin(th);
    const lg = (t: number) => Math.log(at(ox + t * co, oy + t * si) + 8);
    /* El rayo se corta 3 px antes del borde de la foto: afuera el gris es 0 y el borde sería el escalón más fuerte de todos. */
    const aLaOrilla = (o: number, d: number, n: number) => (d > 0 ? (n - 4 - o) / d : d < 0 ? (o - 3) / -d : Infinity);
    const tope = Math.min(hasta, aLaOrilla(ox, co, img.cols), aLaOrilla(oy, si, img.rows));
    const perfil: { t: number; dv: number }[] = [];
    for (let t = Math.max(2, desde); t <= tope; t += 0.5) perfil.push({ t, dv: lg(t + 2) - lg(t - 2) });
    /* Mínimos de verdad: las puntas del perfil no cuentan (sin vecino, cualquier bajada sería un escalón). */
    const minimos = perfil.filter((p, i) => i > 0 && i < perfil.length - 1 && p.dv < 0 && p.dv <= perfil[i - 1]!.dv && p.dv <= perfil[i + 1]!.dv).sort((p, q) => p.dv - q.dv);
    /* De dos a menos de 3 px, el más fuerte (vienen ordenados por fuerza). */
    const min: { t: number; dv: number }[] = [];
    for (const m of minimos) if (min.every((x) => Math.abs(x.t - m.t) >= 3)) min.push(m);
    crudos.push({ co, si, min: min.sort((p, q) => p.t - q.t) });
  }
  const umbral = Math.max(ESCALON_LOG_MIN, UMBRAL_RELATIVO * mediana(crudos.map((r) => -Math.min(0, ...r.min.map((m) => m.dv)))));
  return crudos.map(({ co, si, min }) => ({
    co,
    si,
    ts: min
      .filter((m) => -m.dv >= umbral)
      .slice(0, POR_RAYO)
      .map((m) => m.t),
  }));
}

function circuloPor([ax, ay]: [number, number], [bx, by]: [number, number], [cx, cy]: [number, number]): Circulo | null {
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) return null;
  const [a2, b2, c2] = [ax * ax + ay * ay, bx * bx + by * by, cx * cx + cy * cy];
  const x = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const y = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { x, y, r: Math.hypot(ax - x, ay - y) };
}

/**
 * Cuántos rayos tienen un escalón sobre el círculo (± `tol` px) y cuán justo:
 * `puntaje` suma 1 − (d/tol)² por rayo. El puntaje decide entre dos círculos
 * casi iguales: uno corrido que pisa a medias el borde de la madera y a medias
 * el de afuera de la corteza junta tantos rayos como el bueno, pero ninguno
 * justo. El toque está adentro: cada rayo lo cruza una vez.
 */
function sostienen(rayos: readonly Rayo[], ox: number, oy: number, c: Circulo, tol: number): { n: number; puntaje: number } {
  const [px, py] = [ox - c.x, oy - c.y];
  const cc = px * px + py * py - c.r * c.r;
  let n = 0;
  let puntaje = 0;
  for (const r of rayos) {
    const b = px * r.co + py * r.si;
    const t = -b + Math.sqrt(Math.max(0, b * b - cc));
    let d = tol + 1;
    for (const x of r.ts) d = Math.min(d, Math.abs(x - t));
    if (d > tol) continue;
    n++;
    puntaje += 1 - (d / tol) ** 2;
  }
  return { n, puntaje };
}

/**
 * El círculo con más puntaje, entre los que proponen las ternas. Si adentro y
 * con el mismo centro hay otro casi tan sostenido, gana ese: es el borde de la
 * madera y el grande, el de afuera de la corteza (la corteza se suma después).
 * Sin esta regla gana el de afuera cuando los dos bordes son igual de nítidos:
 * la tolerancia crece con el radio y le da más puntaje.
 */
export function circuloDelToque(rayos: readonly Rayo[], ox: number, oy: number, rMin: number, rMax: number): { c: Circulo; apoyo: number } | null {
  const punto = (k: number, t: number): [number, number] => [ox + t * rayos[k]!.co, oy + t * rayos[k]!.si];
  const candidatos: { c: Circulo; apoyo: number; puntaje: number }[] = [];
  let mejor: { c: Circulo; apoyo: number; puntaje: number } | null = null;
  for (const [d1, d2] of TERNAS) {
    for (let i = 0; i < RAYOS; i++) {
      const [j, k] = [(i + d1) % RAYOS, (i + d2) % RAYOS];
      for (const ti of rayos[i]!.ts)
        for (const tj of rayos[j]!.ts)
          for (const tk of rayos[k]!.ts) {
            const c = circuloPor(punto(i, ti), punto(j, tj), punto(k, tk));
            if (!c || c.r < rMin || c.r > rMax || Math.hypot(ox - c.x, oy - c.y) > TOQUE_ADENTRO * c.r) continue;
            const { n, puntaje } = sostienen(rayos, ox, oy, c, Math.max(2, 0.04 * c.r));
            const este = { c, apoyo: n, puntaje };
            if (puntaje >= MADERA_ADENTRO.puntaje * 0.2 * RAYOS) candidatos.push(este);
            if (!mejor || puntaje > mejor.puntaje || (puntaje === mejor.puntaje && c.r < mejor.c.r)) mejor = este;
          }
    }
  }
  if (!mejor) return null;
  const grande = mejor.c;
  const madera = candidatos
    .filter(({ c, puntaje }) => c.r >= MADERA_ADENTRO.rMin * grande.r && c.r <= MADERA_ADENTRO.rMax * grande.r && Math.hypot(c.x - grande.x, c.y - grande.y) <= MADERA_ADENTRO.centro * grande.r && puntaje >= MADERA_ADENTRO.puntaje * mejor!.puntaje)
    .reduce<typeof mejor | null>((m, x) => (!m || x.puntaje > m.puntaje ? x : m), null);
  const ganador = madera ?? mejor;
  return { c: ganador.c, apoyo: ganador.apoyo };
}

const adentro = (e: ElipseCruda, x: number, y: number): boolean => {
  const f = (e.angulo * Math.PI) / 180;
  const [dx, dy] = [x - e.cx, y - e.cy];
  const u = dx * Math.cos(f) + dy * Math.sin(f);
  const v = -dx * Math.sin(f) + dy * Math.cos(f);
  return (u / (e.ancho / 2)) ** 2 + (v / (e.alto / 2)) ** 2 <= 1;
};

/**
 * La testa donde tocó el operador (px de la enderezada), con corteza. `rRef` =
 * el radio típico de las otras testas de la foto. `null` = alrededor del toque
 * no hay un borde redondo: la pantalla pone un círculo a ojo.
 */
export function testaEn(cv: OpenCvTestas, suave: Muestreable, x: number, y: number, rRef: number, mmPorPx: number, id: string): TestaPropuesta | null {
  const rb = radiosBuscados(mmPorPx);
  const rMin = Math.max(0.8 * rb.min, 0.4 * rRef);
  const rMax = 1.2 * rb.max;
  const rayos = rayosDesdeElToque(suave, x, y, 0.15 * rMin, (1 + TOQUE_ADENTRO) * rMax);
  const hallado = circuloDelToque(rayos, x, y, rMin, rMax);
  if (!hallado || hallado.apoyo < 0.2 * RAYOS) return null;
  const { c } = hallado;
  let e: ElipseCruda | null = { cx: c.x, cy: c.y, ancho: 2 * c.r, alto: 2 * c.r, angulo: 0, puntos: hallado.apoyo };
  for (let vuelta = 0; vuelta < 3 && e; vuelta++) {
    const r = (e.ancho + e.alto) / 4;
    e = elipseRobusta(cv, bordeGuiado(rayos, x, y, e, Math.max(3, (vuelta ? 0.06 : 0.1) * r)));
  }
  const buena = e && e.puntos >= 0.2 * RAYOS && !alargada(e) && adentro(e, x, y) ? e : null;
  const final = buena ?? { cx: c.x, cy: c.y, ancho: 2 * c.r, alto: 2 * c.r, angulo: 0, puntos: hallado.apoyo };
  return testaConCorteza(suave, final, mmPorPx, id, "agregada");
}
