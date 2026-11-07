/**
 * «Zonas a ignorar» del detector de personas (Brandon 2026-10-08, modo autónomo).
 *
 * El riesgo que dejó anotado el detector del mosaico: un objeto QUIETO que el
 * modelo confunde con una persona —el poste de la entrada, una casaca colgada,
 * un maniquí— saca una foto «Sigue en cuadro» por minuto todo el día, y si la
 * luz lo hace «desaparecer» y «volver», un WhatsApp «Apareció alguien». La
 * solución es marcar sobre un cuadro de la cámara 1-4 rectángulos que el
 * detector no mira.
 *
 * Las zonas se guardan en FRACCIONES (0-1) del cuadro, no en píxeles: el
 * detector mira el video a ≤640 px, la foto del historial puede venir a 1920 y
 * el mosaico cambia de tamaño; con fracciones, la misma zona cae en el mismo
 * lugar de cualquier cuadro de la misma cámara.
 *
 * ## Regla de descarte: ≥ 60 % del ÁREA de la caja adentro (no el centro)
 *
 * Una caja de persona se ignora si al menos `PARTE_DENTRO_PARA_IGNORAR` de su
 * área visible cae dentro de las zonas (la unión: dos zonas pegadas suman).
 *
 * - Por qué no «el centro adentro»: una zona angosta (un poste) se tragaría a
 *   una persona de verdad justo cuando pasa por delante, y alguien parado
 *   frente al poste no saldría nunca. Con el área, una persona más ancha que
 *   la zona nunca queda ≥60 % adentro.
 * - Por qué 60 % y no 90 %: la caja del detector baila unos píxeles de un
 *   cuadro a otro y el rectángulo se dibuja con el dedo. Al falso positivo le
 *   basta con que la zona tape un poco más que el objeto (lo dice el ⓘ).
 * - Una caja sin área (ancho o alto 0) decide por su centro.
 *
 * Pura: sirve igual al cliente (detector) y al servidor (validar y guardar).
 */

import type { Camara, ResultadoCamaras } from "./camaras";

/** Rectángulo en fracciones del cuadro: `x`,`y` = esquina superior izquierda. */
export interface ZonaIgnorada {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const MAX_ZONAS_IGNORAR = 4;
/** Lado mínimo de una zona (2 % del cuadro): un toque sin arrastrar no crea una zona. */
export const LADO_MINIMO_ZONA = 0.02;
/** Desde esta parte del área de la caja adentro de las zonas, la caja no cuenta como persona. */
export const PARTE_DENTRO_PARA_IGNORAR = 0.6;

/** Caja de persona en píxeles del cuadro que miró el detector (la forma de `CajaPersona`). */
export interface CajaEnPixeles {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

const acotar01 = (n: number) => Math.min(1, Math.max(0, n));
const redondear = (n: number) => Math.round(n * 10_000) / 10_000;
/** Holgura de coma flotante (no de negocio): 0,6 calculado puede dar 0,59999999. */
const EPS = 1e-9;

/** ¿Es una zona que se puede guardar? Dentro del cuadro y con tamaño. */
export function zonaValida(z: unknown): z is ZonaIgnorada {
  if (!z || typeof z !== "object") return false;
  const { x, y, w, h } = z as Record<string, unknown>;
  const nums = [x, y, w, h];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  const [zx, zy, zw, zh] = nums as number[];
  return (
    zx >= 0 &&
    zy >= 0 &&
    zw >= LADO_MINIMO_ZONA - 1e-6 &&
    zh >= LADO_MINIMO_ZONA - 1e-6 &&
    zx + zw <= 1 + 1e-4 &&
    zy + zh <= 1 + 1e-4
  );
}

/**
 * Las zonas listas para guardar (redondeadas a 4 decimales y metidas en el
 * cuadro), o `null` si alguna no sirve o son más de `MAX_ZONAS_IGNORAR`.
 */
export function normalizarZonas(zonas: readonly unknown[]): ZonaIgnorada[] | null {
  if (zonas.length > MAX_ZONAS_IGNORAR) return null;
  const salida: ZonaIgnorada[] = [];
  for (const z of zonas) {
    if (!zonaValida(z)) return null;
    const x = redondear(acotar01(z.x));
    const y = redondear(acotar01(z.y));
    salida.push({ x, y, w: redondear(Math.min(z.w, 1 - x)), h: redondear(Math.min(z.h, 1 - y)) });
  }
  return salida;
}

/** Las zonas guardadas de una cámara; lo que no sirva (un JSON viejo, a mano) se descarta. */
export function zonasDeCamara(camara: { zonasIgnorar?: unknown } | null | undefined): ZonaIgnorada[] {
  const crudo = camara?.zonasIgnorar;
  if (!Array.isArray(crudo)) return [];
  return crudo.filter(zonaValida).slice(0, MAX_ZONAS_IGNORAR);
}

/**
 * Qué parte (0-1) del área VISIBLE de la caja cae dentro de la unión de las
 * zonas. La caja viene en píxeles de un cuadro de `ancho` × `alto`; lo que se
 * sale del cuadro no cuenta. Unión exacta por compresión de coordenadas: con
 * ≤4 zonas son a lo sumo 9 × 9 celdas.
 */
export function parteDentroDeZonas(
  caja: CajaEnPixeles,
  ancho: number,
  alto: number,
  zonas: readonly ZonaIgnorada[],
): number {
  if (!(ancho > 0) || !(alto > 0) || zonas.length === 0) return 0;
  const x1 = acotar01(caja.x / ancho);
  const y1 = acotar01(caja.y / alto);
  const x2 = acotar01((caja.x + caja.ancho) / ancho);
  const y2 = acotar01((caja.y + caja.alto) / alto);
  const area = (x2 - x1) * (y2 - y1);

  if (!(area > 0)) {
    /* Caja sin área: decide su centro (sobre la caja ya acotada al cuadro). */
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    return zonas.some((z) => cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h) ? 1 : 0;
  }

  /* Cada zona recortada a la caja; las que no la tocan no cuentan. */
  const recortes = zonas
    .map((z) => ({
      a: Math.max(x1, z.x),
      b: Math.min(x2, z.x + z.w),
      c: Math.max(y1, z.y),
      d: Math.min(y2, z.y + z.h),
    }))
    .filter((r) => r.b > r.a && r.d > r.c);
  if (recortes.length === 0) return 0;

  const xs = [...new Set(recortes.flatMap((r) => [r.a, r.b]))].sort((p, q) => p - q);
  const ys = [...new Set(recortes.flatMap((r) => [r.c, r.d]))].sort((p, q) => p - q);
  let tapada = 0;
  for (let i = 0; i < xs.length - 1; i++) {
    const mx = (xs[i] + xs[i + 1]) / 2;
    for (let j = 0; j < ys.length - 1; j++) {
      const my = (ys[j] + ys[j + 1]) / 2;
      if (recortes.some((r) => mx > r.a && mx < r.b && my > r.c && my < r.d)) {
        tapada += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      }
    }
  }
  return Math.min(1, tapada / area);
}

/** ¿Esta caja cae en una zona ignorada? (≥ `PARTE_DENTRO_PARA_IGNORAR` de su área adentro). */
export function cajaIgnorada(
  caja: CajaEnPixeles,
  ancho: number,
  alto: number,
  zonas: readonly ZonaIgnorada[],
): boolean {
  return parteDentroDeZonas(caja, ancho, alto, zonas) >= PARTE_DENTRO_PARA_IGNORAR - EPS;
}

/**
 * Separa las cajas que cuentan como persona de las que caen en una zona
 * ignorada. Va ANTES de `decidirFotoPersona`: una caja ignorada no confirma
 * «apareció», no suma a «llegó otra» y no sostiene «sigue en cuadro».
 */
export function filtrarCajasIgnoradas<T extends CajaEnPixeles>(
  cajas: readonly T[],
  ancho: number,
  alto: number,
  zonas: readonly ZonaIgnorada[],
): { quedan: T[]; ignoradas: T[] } {
  if (zonas.length === 0) return { quedan: [...cajas], ignoradas: [] };
  const quedan: T[] = [];
  const ignoradas: T[] = [];
  for (const c of cajas) (cajaIgnorada(c, ancho, alto, zonas) ? ignoradas : quedan).push(c);
  return { quedan, ignoradas };
}

/** Guarda las zonas de una cámara en la lista (el modelo de `CamarasDB.configurarZonasIgnorar`). */
export function configurarZonasIgnorar(
  camaras: readonly Camara[],
  id: string,
  zonas: readonly unknown[],
): ResultadoCamaras {
  const camara = camaras.find((c) => c.id === id);
  if (!camara) return { ok: false, motivo: "Esa cámara no está en la lista." };
  const limpias = normalizarZonas(zonas);
  if (!limpias) {
    return {
      ok: false,
      motivo: `Hasta ${MAX_ZONAS_IGNORAR} zonas, cada una dentro del cuadro y no tan chica.`,
    };
  }
  const n = limpias.length;
  return {
    ok: true,
    camaras: camaras.map((c) => (c.id === id ? { ...c, zonasIgnorar: n ? limpias : null } : c)),
    mensaje: n
      ? `${camara.nombre}: el detector ignora ${n} ${n === 1 ? "zona" : "zonas"}.`
      : `${camara.nombre}: el detector mira todo el cuadro.`,
  };
}
