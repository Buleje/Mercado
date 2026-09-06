/**
 * cubicacion-verificacion.ts — recalcular cada troza y cruzarla con la guía.
 *
 * Una GTF trae, por pieza, sus dos diámetros, su largo **y** su volumen. Son
 * cuatro números que tienen que ser coherentes entre sí, y cuando no lo son hay
 * un error de carga que ningún gate estático ve: la guía `019-0000016` publicaba
 * la troza `20/A` con 6.129 m³ cuando sus medidas dan 2.043.
 *
 * ── QUÉ FÓRMULA USA LA GUÍA (medido, no supuesto) ───────────────────────────
 *
 * Se compararon las dos fórmulas de cubicación contra seis piezas reales:
 *
 *   pieza    guía      Huber      Δ       Smalian     Δ
 *   20/A     2.0430    2.0428   −0.01%    2.0433    +0.01%
 *   111/B    3.5160    3.5162   +0.01%    3.5193    +0.09%
 *   117/B    2.1180    2.1182   +0.01%    2.1425    +1.16%   ← la más cónica
 *   112/A    4.9660    4.9659   −0.00%    4.9758    +0.20%
 *   99/B     2.7200    2.7201   +0.00%    2.7202    +0.01%
 *   25/A     1.7000    1.7001   +0.00%    1.7063    +0.37%
 *
 * **SERFOR publica con Huber** (área del diámetro medio), no con Smalian. Por eso
 * el que juzga si una pieza está mal cargada es Huber: usar Smalian marcaría en
 * rojo la `117/B`, que está perfecta, y siete rojos falsos enseñan a ignorar la
 * lista entera.
 *
 * Smalian se calcula igual y se muestra al lado, porque es la fórmula que pide
 * el operador y la diferencia entre ambas **es información**: cuanto más cónica
 * la troza, más se separan.
 *
 * PURO y client-safe.
 */

import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

/** Área de un círculo en m², a partir de un diámetro en cm. */
const areaM2 = (diamCm: number) => (Math.PI / 4) * (diamCm / 100) ** 2;

const r4 = (n: number) => Number(n.toFixed(4));

export interface MedidasTroza {
  d1Cm?: number | null;
  d2Cm?: number | null;
  largoM?: number | null;
}

/**
 * **Huber** — área del diámetro MEDIO × largo.
 *
 * Es la que reproduce el volumen que declara la GTF. Trata el rollo como un
 * cilindro del grosor de su punto medio.
 */
export function volumenHuber(m: MedidasTroza): number | null {
  const { d1Cm: d1, d2Cm: d2, largoM: l } = m;
  if (!(l != null && l > 0)) return null;
  const dm = d1 != null && d2 != null ? (d1 + d2) / 2 : (d1 ?? d2);
  if (!(dm != null && dm > 0)) return null;
  return r4(areaM2(dm) * l);
}

/**
 * **Smalian** — promedio de las áreas de los DOS extremos × largo.
 *
 * Más fiel a un tronco cónico que Huber, y por eso siempre da un poco más: el
 * promedio de las áreas es mayor que el área del promedio salvo que los dos
 * diámetros sean iguales. Con 62→50 cm la diferencia llega al 1.16 %.
 */
export function volumenSmalian(m: MedidasTroza): number | null {
  const { d1Cm: d1, d2Cm: d2, largoM: l } = m;
  if (!(l != null && l > 0)) return null;
  if (d1 == null || d2 == null) {
    // Con un solo diámetro, Smalian degenera en Huber: no hay cono que promediar.
    return volumenHuber(m);
  }
  if (!(d1 > 0) || !(d2 > 0)) return null;
  return r4(((areaM2(d1) + areaM2(d2)) / 2) * l);
}

/** Cuánto se separan las dos fórmulas, en %. Mide lo cónica que es la troza. */
export function conicidadPct(m: MedidasTroza): number | null {
  const h = volumenHuber(m);
  const s = volumenSmalian(m);
  if (h == null || s == null || !(h > 0)) return null;
  return Math.round(((s - h) / h) * 1000) / 10;
}

// ── El cruce contra la guía ─────────────────────────────────────────────────

/**
 * Tolerancia por defecto: **2 %**.
 *
 * No sale del float sino de la medición: Huber reproduce la guía con ≤0.01 % de
 * error, así que 2 % deja pasar cualquier redondeo del emisor y sigue atrapando
 * un `×3` como el de `20/A` (+200 %). Bajarla a décimas llenaría la lista de
 * rojos por el último decimal.
 */
export const TOLERANCIA_PCT = 2;

export interface TrozaAVerificar extends MedidasTroza {
  id?: string;
  codificacion?: string | null;
  cantidad?: number | null;
  /** Lo que la guía declara para esta fila (por el total de `cantidad` piezas). */
  volumenM3?: number | string | null;
}

export interface VerificacionTroza {
  id?: string;
  codificacion: string | null;
  cantidad: number;
  /** Lo que dice la guía para la fila completa. */
  declaradoM3: number | null;
  /** Lo que dan las medidas de UNA pieza, por Huber (la fórmula de la guía). */
  huberM3: number | null;
  /** Lo mismo por Smalian. */
  smalianM3: number | null;
  /** Huber × cantidad: con qué se compara la fila entera. */
  esperadoM3: number | null;
  /** `declarado − esperado`, en % del esperado. */
  desvioPct: number | null;
  /**
   * El diagnóstico, en el idioma del que carga:
   * - `ok` — las medidas y el volumen se corresponden.
   * - `sin-medidas` — no hay con qué recalcular; no es un error, es un hueco.
   * - `multiplo` — el declarado es (casi) un múltiplo exacto del unitario: la
   *   fila junta N piezas y el `cantidad` no lo dice, o al revés.
   * - `desvio` — no cuadra y no es un múltiplo limpio: hay que mirarlo.
   */
  estado: "ok" | "sin-medidas" | "multiplo" | "desvio";
  /** En `multiplo`, cuántas piezas explican el volumen declarado. */
  piezasQueExplican: number | null;
}

/** Recalcula una fila de la lista de trozas y la cruza con lo que declara. */
export function verificarTroza(t: TrozaAVerificar, tolerancePct = TOLERANCIA_PCT): VerificacionTroza {
  const cantidad = Math.max(1, Math.round(t.cantidad ?? 1));
  const declarado = t.volumenM3 == null ? null : Number(t.volumenM3);
  const huber = volumenHuber(t);
  const smalian = volumenSmalian(t);
  const esperado = huber == null ? null : r4(huber * cantidad);

  const base: Omit<VerificacionTroza, "estado" | "piezasQueExplican" | "desvioPct"> = {
    id: t.id,
    codificacion: t.codificacion ?? null,
    cantidad,
    declaradoM3: declarado == null || !Number.isFinite(declarado) ? null : r4(declarado),
    huberM3: huber,
    smalianM3: smalian,
    esperadoM3: esperado,
  };

  if (esperado == null || base.declaradoM3 == null || !(esperado > 0)) {
    return { ...base, desvioPct: null, estado: "sin-medidas", piezasQueExplican: null };
  }

  const desvioPct = Math.round(((base.declaradoM3 - esperado) / esperado) * 1000) / 10;
  if (Math.abs(desvioPct) <= tolerancePct) {
    return { ...base, desvioPct, estado: "ok", piezasQueExplican: null };
  }

  /* ¿El declarado es N veces el unitario? Es el caso real: la fila trae el total
     de N piezas y `cantidad` dice otra cosa. Saberlo cambia el arreglo — no se
     corrige una medida, se corrige un conteo. */
  const veces = base.declaradoM3 / (huber as number);
  const redondo = Math.round(veces);
  const esMultiplo = redondo >= 1 && Math.abs(veces - redondo) / redondo <= tolerancePct / 100;

  return {
    ...base,
    desvioPct,
    estado: esMultiplo ? "multiplo" : "desvio",
    piezasQueExplican: esMultiplo ? redondo : null,
  };
}

export interface ResumenVerificacion {
  filas: VerificacionTroza[];
  /** Codificaciones que aparecen más de una vez en la MISMA guía. */
  duplicadas: { codificacion: string; veces: number }[];
  conProblema: number;
  sinMedidas: number;
}

/**
 * Verifica la lista de trozas de un ingreso y busca duplicados.
 *
 * El duplicado se busca **dentro de la guía**: dos filas con la misma
 * codificación son la misma troza contada dos veces, y eso infla el volumen del
 * patio sin que ningún total lo delate.
 */
export function verificarLista(
  trozas: readonly TrozaAVerificar[],
  tolerancePct = TOLERANCIA_PCT,
): ResumenVerificacion {
  const filas = trozas.map((t) => verificarTroza(t, tolerancePct));

  const cuenta = new Map<string, number>();
  for (const t of trozas) {
    const c = (t.codificacion ?? "").trim().toUpperCase();
    if (!c) continue;
    cuenta.set(c, (cuenta.get(c) ?? 0) + 1);
  }

  return {
    filas,
    duplicadas: [...cuenta.entries()]
      .filter(([, v]) => v > 1)
      .map(([codificacion, veces]) => ({ codificacion, veces }))
      .sort((a, b) => b.veces - a.veces),
    conProblema: filas.filter((f) => f.estado === "multiplo" || f.estado === "desvio").length,
    sinMedidas: filas.filter((f) => f.estado === "sin-medidas").length,
  };
}

/**
 * La corrección que propone una fila con problema. `null` si no hay una obvia.
 *
 * Para un múltiplo la propuesta es doble y hay que elegir: o la fila son N
 * piezas (y el `cantidad` está mal), o es una y el volumen está mal. Este módulo
 * NO elige — devuelve las dos y el operador decide con el papel.
 */
export function propuestaDeCorreccion(
  f: VerificacionTroza,
): { cantidad: number; volumenM3: number; resumen: string }[] {
  if (f.estado !== "multiplo" || f.huberM3 == null || f.piezasQueExplican == null) return [];
  const n = f.piezasQueExplican;
  return [
    {
      cantidad: 1,
      volumenM3: f.huberM3,
      resumen: `Es UNA troza: el volumen pasa a ${fmtM3(f.huberM3)} m³ (lo que dan sus medidas).`,
    },
    {
      cantidad: n,
      volumenM3: r4(f.huberM3 * n),
      resumen: `Son ${n} trozas de esas medidas: la cantidad pasa a ${n} y el volumen a ${fmtM3(r4(f.huberM3 * n))} m³.`,
    },
  ];
}
