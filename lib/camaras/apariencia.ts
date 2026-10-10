/**
 * Apariencia de una persona SIN biometría (ADR-479, contrato K3 (c), 2026-10-08).
 *
 * Para contar «personas distintas del día» sin reconocer a nadie, cada caja de
 * persona que guarda el detector lleva una FIRMA DE LA ROPA: un histograma de
 * color (8 tonos + 4 grises) del torso y otro de las piernas, 4 bits por
 * casillero → 24 caracteres hex. Y un sí/no de chaleco fluorescente.
 *
 * Lo que NUNCA entra:
 *   - La franja de la cabeza (el 18 % de arriba de la caja): `firmaDelCuerpo`
 *     ni la recibe, y el servidor ni la recorta (`apariencia.server.ts`).
 *   - La altura ni la forma del cuerpo: sólo colores contados, sin posición.
 *   - Redes de re-identificación o embeddings: codifican rasgos físicos.
 *
 * Por qué así (calibrado con las 69 fotos reales de Blas del 08-10, ver ADR):
 *   - Sólo la franja central (`ANCHO_CENTRAL`): los costados de la caja son
 *     fondo (tablas, arena) y el trazo de la caja que dibuja `componerFoto`.
 *   - El tono es igual con sol o con sombra (multiplicar el RGB no lo cambia);
 *     el gris se mide RELATIVO a lo más claro de la misma persona, así una
 *     camisa blanca a la sombra sigue siendo «la más clara», no «gris».
 *   - Reparto suave entre casilleros vecinos: un tono en el borde de dos no
 *     salta entero de uno al otro por un poco de ruido del video.
 *
 * Puro y client-safe: lo usan el servidor (firma), el agrupador del día
 * (`visitantes.ts`) y los tests.
 */

import { z } from "zod";

/** Una caja de menos de esto (px de la foto guardada) no lleva firma: con 10-25 px adivinar sería inventar. */
export const ALTO_MIN_FIRMA_PX = 40;
/** La franja de la cabeza: el 0-18 % de arriba de la caja. Nunca se lee. */
export const CABEZA = 0.18;
/** Torso = 18-55 % de la caja; piernas = 55-100 %. */
export const TORSO_HASTA = 0.55;
/** Se mira la mitad central del ancho de la caja. */
export const ANCHO_CENTRAL = 0.5;
/** Chaleco = al menos esta porción del torso en amarillo/naranja fluorescente. */
export const PORCION_CHALECO = 0.25;
/** Dos firmas a esta distancia o menos son «la misma ropa» (0-1). Calibrado con Blas: ver ADR-479. */
export const UMBRAL_MISMA_ROPA = 0.3;

const TONOS = 8;
const GRISES = 4;
const CASILLEROS = TONOS + GRISES;
/** 12 del torso + 12 de las piernas. */
export const LARGO_FIRMA = CASILLEROS * 2;
/** Menos saturado que esto (o muy oscuro) = gris: blanco, negro, jean gastado. */
const SATURACION_GRIS = 0.22;
const OSCURO = 0.12;
/**
 * Lo más claro de la persona (percentil 90) nunca vale menos que esto: el gris
 * es relativo sólo con ropa clara al sol; alguien de oscuro o a la sombra se
 * mide casi en absoluto y no se «aclara» a blanco. Con las fotos de Blas, 0,7
 * separó mejor que 0,35 (AUC 0,951 vs 0,933) y que el brillo absoluto puro
 * (0,954, pero una camisa blanca a la sombra caía a «gris»).
 */
const REFERENCIA_MIN = 0.7;
/** Filas mínimas de una zona para contarla (torso o piernas cortadas por el borde de la foto). */
const FILAS_MIN_ZONA = 4;
/**
 * El cuerpo se achica a esto como mucho antes del histograma (revisión de
 * seguridad 08-10): el trabajo por caja queda fijo, sea la persona grande o
 * chica. 64 × 128 = 8 192 muestras: sobra para contar colores.
 */
export const CUERPO_MAX_ANCHO = 64;
export const CUERPO_MAX_FILAS = 128;

export interface FirmaApariencia {
  /** 24 caracteres hex; `0` en las 12 de las piernas si no se vieron. */
  firma: string;
  chaleco: boolean;
}

function tonoSaturacionValor(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const v = max / 255;
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  if (d === 0) return [0, s, v];
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return [h < 0 ? h + 360 : h, s, v];
}

/**
 * Amarillo-verde o naranja fluorescente (chalecos de seguridad). El sol sobre
 * la madera y la arena no llega a esta saturación (0 de 26 cajas reales de
 * Blas). El ámbar de 35-47° queda AFUERA a propósito: es el color con que
 * `componerFoto` dibuja las cajas y las etiquetas «60 %» sobre la foto, y una
 * caja vecina que se cruza no puede volver «con chaleco» a nadie.
 */
export function esFluorescente(r: number, g: number, b: number): boolean {
  const [h, s, v] = tonoSaturacionValor(r, g, b);
  if (v < 0.55) return false;
  if (h >= 8 && h <= 34) return s >= 0.72;
  return h >= 48 && h <= 90 && s >= 0.6;
}

/** Reparte `peso` entre los dos casilleros vecinos más cercanos a `pos` (en unidades de casillero). */
function repartir(h: Float64Array, desde: number, n: number, pos: number, circular: boolean, peso: number): void {
  const base = Math.floor(pos);
  const frac = pos - base;
  const a = circular ? ((base % n) + n) % n : Math.min(Math.max(base, 0), n - 1);
  const b = circular ? (a + 1) % n : Math.min(a + 1, n - 1);
  h[desde + a] += peso * (1 - frac);
  h[desde + b] += peso * frac;
}

interface Zona {
  filaDesde: number;
  filaHasta: number;
}

/** Histograma de 12 casilleros de una zona, cuantizado a 0-15 (relativo al casillero más alto). */
function histogramaZona(
  rgba: Uint8ClampedArray | Uint8Array,
  ancho: number,
  zona: Zona,
  colDesde: number,
  colHasta: number,
  referencia: number,
): number[] | null {
  if (zona.filaHasta - zona.filaDesde < FILAS_MIN_ZONA || colHasta <= colDesde) return null;
  const h = new Float64Array(CASILLEROS);
  for (let y = zona.filaDesde; y < zona.filaHasta; y++) {
    for (let x = colDesde; x < colHasta; x++) {
      const i = (y * ancho + x) * 4;
      const [tono, s, v] = tonoSaturacionValor(rgba[i], rgba[i + 1], rgba[i + 2]);
      if (s < SATURACION_GRIS || v < OSCURO) {
        // Gris relativo: 0 = negro, 1 = lo más claro de esta persona. Centros en 0,125 · 0,375 · 0,625 · 0,875.
        const rel = Math.min(1, v / referencia);
        repartir(h, TONOS, GRISES, Math.min(Math.max(rel * GRISES - 0.5, 0), GRISES - 1), false, 1);
      } else {
        // 8 tonos de 45°, centrados en 0° (rojo), 45° (naranja), 90°…
        repartir(h, 0, TONOS, tono / 45, true, 1);
      }
    }
  }
  const max = Math.max(...h);
  if (max <= 0) return null;
  return Array.from(h, (x) => Math.round((15 * x) / max));
}

/** Valor (brillo) del percentil 90 de la franja central del cuerpo: la «luz» de esta persona. */
function referenciaDeLuz(rgba: Uint8ClampedArray | Uint8Array, ancho: number, filas: number, c0: number, c1: number): number {
  const conteo = new Uint32Array(256);
  let total = 0;
  for (let y = 0; y < filas; y++) {
    for (let x = c0; x < c1; x++) {
      const i = (y * ancho + x) * 4;
      conteo[Math.max(rgba[i], rgba[i + 1], rgba[i + 2])]++;
      total++;
    }
  }
  let acumulado = 0;
  for (let v = 255; v >= 0; v--) {
    acumulado += conteo[v];
    if (acumulado >= total * 0.1) return Math.max(REFERENCIA_MIN, v / 255);
  }
  return REFERENCIA_MIN;
}

/**
 * Firma de la ropa a partir de los píxeles del CUERPO (la caja SIN la franja
 * de la cabeza: la fila 0 es el 18 % de la caja). `altoCaja` = alto de la caja
 * entera en px de la foto: decide el mínimo y dónde termina el torso. Si la
 * foto corta las piernas (borde o banda del rótulo), `rgba` trae menos filas.
 */
export function firmaDelCuerpo(
  rgba: Uint8ClampedArray | Uint8Array,
  ancho: number,
  filas: number,
  altoCaja: number,
): FirmaApariencia | null {
  if (altoCaja < ALTO_MIN_FIRMA_PX || ancho < 2 || filas < FILAS_MIN_ZONA) return null;
  if (rgba.length < ancho * filas * 4) return null;
  const margen = Math.floor((ancho * (1 - ANCHO_CENTRAL)) / 2);
  const c0 = margen;
  const c1 = Math.max(c0 + 1, ancho - margen);
  const finTorso = Math.min(filas, Math.round(altoCaja * (TORSO_HASTA - CABEZA)));
  const referencia = referenciaDeLuz(rgba, ancho, filas, c0, c1);
  const torso = histogramaZona(rgba, ancho, { filaDesde: 0, filaHasta: finTorso }, c0, c1, referencia);
  if (!torso) return null;
  const piernas = histogramaZona(rgba, ancho, { filaDesde: finTorso, filaHasta: filas }, c0, c1, referencia);

  let fluor = 0;
  let total = 0;
  for (let y = 0; y < finTorso; y++) {
    for (let x = c0; x < c1; x++) {
      const i = (y * ancho + x) * 4;
      if (esFluorescente(rgba[i], rgba[i + 1], rgba[i + 2])) fluor++;
      total++;
    }
  }
  const hex = [...torso, ...(piernas ?? new Array<number>(CASILLEROS).fill(0))].map((n) => n.toString(16)).join("");
  return { firma: hex, chaleco: total > 0 && fluor / total >= PORCION_CHALECO };
}

/**
 * El recorte `[x0, x1) × [y0, y1)` de una foto ya decodificada (`canales` 3 o
 * 4 por píxel, fila tras fila) en una grilla RGBA de ≤ `CUERPO_MAX_ANCHO` ×
 * `CUERPO_MAX_FILAS`. Vecino más cercano y no promedio: el histograma CUENTA
 * colores, y promediar inventaría tonos que no están (franja fluorescente +
 * tela oscura = un naranja apagado que ya no es chaleco). Un recorte que ya
 * entra queda idéntico. `escalaFilas` pasa `altoCaja` a la misma unidad.
 */
export function muestrearRecorte(
  crudo: Uint8Array | Uint8ClampedArray,
  anchoFoto: number,
  canales: number,
  r: { x0: number; y0: number; x1: number; y1: number },
): { rgba: Uint8Array; ancho: number; filas: number; escalaFilas: number } {
  const anchoR = Math.max(0, r.x1 - r.x0);
  const filasR = Math.max(0, r.y1 - r.y0);
  const ancho = Math.min(anchoR, CUERPO_MAX_ANCHO);
  const filas = Math.min(filasR, CUERPO_MAX_FILAS);
  const rgba = new Uint8Array(ancho * filas * 4);
  for (let j = 0; j < filas; j++) {
    const sy = r.y0 + Math.floor(((j + 0.5) * filasR) / filas);
    for (let i = 0; i < ancho; i++) {
      const o = (sy * anchoFoto + r.x0 + Math.floor(((i + 0.5) * anchoR) / ancho)) * canales;
      const d = (j * ancho + i) * 4;
      rgba[d] = crudo[o];
      rgba[d + 1] = crudo[o + 1];
      rgba[d + 2] = crudo[o + 2];
      rgba[d + 3] = 255;
    }
  }
  return { rgba, ancho, filas, escalaFilas: filasR > 0 ? filas / filasR : 1 };
}

/**
 * Lo mismo con la caja ENTERA (`alto` = alto de la caja): la franja de la
 * cabeza se salta sin leerla. Para tests y para quien ya tenga la caja.
 */
export function firmaDePixeles(rgba: Uint8ClampedArray | Uint8Array, ancho: number, alto: number): FirmaApariencia | null {
  const filaCuerpo = Math.ceil(alto * CABEZA);
  return firmaDelCuerpo(rgba.subarray(filaCuerpo * ancho * 4), ancho, alto - filaCuerpo, alto);
}

/**
 * Alto (px) de la banda «cámara · hora» que `componerFoto`
 * (`components/admin/forestal/camaras/detector-personas.ts`) pinta abajo de
 * la foto: `max(14, ancho/55) + 12`. Las piernas no se miden adentro de ella.
 * Si cambia allá, cambia acá.
 */
export function altoBandaRotulo(anchoFoto: number): number {
  return Math.max(14, Math.round(anchoFoto / 55)) + 12;
}

const FIRMA_VALIDA = new RegExp(`^[0-9a-f]{${LARGO_FIRMA}}$`);

function zonaDeFirma(firma: string, zona: 0 | 1): number[] | null {
  const q = Array.from(firma.slice(zona * CASILLEROS, (zona + 1) * CASILLEROS), (c) => parseInt(c, 16));
  const suma = q.reduce((a, b) => a + b, 0);
  return suma > 0 ? q.map((x) => x / suma) : null;
}

/** Mitad de la distancia L1 entre dos histogramas normalizados: 0 = iguales, 1 = nada en común. */
function distanciaZona(a: number[], b: number[]): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / 2;
}

/**
 * Qué tan distinta es la ropa (0-1). Torso y piernas pesan igual; si una de
 * las dos no tiene piernas (cortadas por el borde), cuenta sólo el torso.
 * Firma inválida = 1 (nunca «la misma»).
 */
export function distanciaFirmas(a: string, b: string): number {
  if (!FIRMA_VALIDA.test(a) || !FIRMA_VALIDA.test(b)) return 1;
  const ta = zonaDeFirma(a, 0);
  const tb = zonaDeFirma(b, 0);
  if (!ta || !tb) return 1;
  const dTorso = distanciaZona(ta, tb);
  const pa = zonaDeFirma(a, 1);
  const pb = zonaDeFirma(b, 1);
  if (!pa || !pb) return dTorso;
  return (dTorso + distanciaZona(pa, pb)) / 2;
}

/* ── Cajas que manda el detector junto a la foto ─────────────────────────── */

/** Una persona en el cuadro, en fracciones 0-1 de la foto. */
export const cajaPersonaSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  ancho: z.number().gt(0).max(1),
  alto: z.number().gt(0).max(1),
  confianza: z.number().min(0).max(1),
  /**
   * Chaleco leído en vivo como marcador (fase 5): sólo 200-244
   * (`RANGO_CHALECOS` de `marcadores.ts`; 245-249 es la hoja de prueba).
   * Lo manda el cliente y pesa más que la ropa: el servidor lo conserva sólo
   * si está registrado (`marcadorDeChaleco`).
   */
  marcador: z.number().int().min(200).max(244).nullable().optional(),
});
export type CajaPersonaFraccion = z.infer<typeof cajaPersonaSchema>;

/**
 * Los chalecos con marcador registrados del negocio. Hoy NINGUNO: el registro
 * de marcadores (`camaras-marcadores.db.ts`) sólo asigna 0-199 a trozas y los
 * de chaleco siguen sin uso. Mientras tanto, todo marcador que mande el
 * cliente se descarta.
 */
export const SIN_CHALECOS_REGISTRADOS: ReadonlySet<number> = new Set();

/** El marcador de una caja sólo si es un chaleco registrado; si no, `null` (manda la ropa). */
export function marcadorDeChaleco(marcador: number | null | undefined, registrados: ReadonlySet<number>): number | null {
  return marcador != null && registrados.has(marcador) ? marcador : null;
}

/**
 * Tope de cajas por foto (revisión de seguridad 08-10: era 50). El servidor
 * decodifica la foto una vez y muestrea cada cuerpo, pero igual acota el
 * trabajo; la ruta además exige no más cajas que las `personas` declaradas.
 */
export const MAX_CAJAS_POR_FOTO = 10;
export const cajasPersonaSchema = z.array(cajaPersonaSchema).max(MAX_CAJAS_POR_FOTO);

/** Lo que queda guardado en `ocrMetadata.cajas[i]` de la foto. La firma la pone el SERVIDOR. */
export interface CajaGuardada extends CajaPersonaFraccion {
  firma: string | null;
  chaleco: boolean | null;
}

export const cajaGuardadaSchema = cajaPersonaSchema.extend({
  firma: z.string().regex(FIRMA_VALIDA).nullable(),
  chaleco: z.boolean().nullable(),
});

/**
 * El campo `cajas` del formulario. Ausente o vacío = cliente viejo (la foto
 * queda «sin cajas», como las de antes del 08-10). JSON roto o fuera de
 * rango = `ok: false` (la ruta contesta 400).
 */
export function leerCajasDelFormulario(
  valor: unknown,
): { ok: true; cajas: CajaPersonaFraccion[] | null } | { ok: false } {
  if (valor === null || valor === undefined || valor === "") return { ok: true, cajas: null };
  if (typeof valor !== "string" || valor.length > 20_000) return { ok: false };
  let crudo: unknown;
  try {
    crudo = JSON.parse(valor);
  } catch {
    return { ok: false };
  }
  const r = cajasPersonaSchema.safeParse(crudo);
  return r.success ? { ok: true, cajas: r.data } : { ok: false };
}

/** Las cajas guardadas en la metadata de una foto, o `null` si es de antes (o están rotas). */
export function leerCajasGuardadas(meta: Record<string, unknown> | null | undefined): CajaGuardada[] | null {
  const crudo = meta?.cajas;
  if (!Array.isArray(crudo)) return null;
  const r = z.array(cajaGuardadaSchema).max(MAX_CAJAS_POR_FOTO).safeParse(crudo);
  return r.success ? r.data : null;
}
