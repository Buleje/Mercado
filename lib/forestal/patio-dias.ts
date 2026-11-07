/**
 * patio-dias — cuántos días lleva una troza parada y en qué tramo cae (ADR-431).
 *
 * El mismo patio se pintaba con TRES escalas de días: la KPI de Consumos
 * (añeja desde 15, con `>=`), la antigüedad de Saldos (`>` estricto, 30/60) y la
 * pestaña Trozas (menos de 30 / 30-59 / 60+). Una troza de 15 días salía
 * «añeja» en una pantalla y «fresca» en la de al lado; una de 60 era «varada»
 * en la tira de pendientes y no en el Aging. Acá vive UNA escala y UNA función
 * de días, y la usan la KPI, la columna, el filtro, el Aging y la pestaña Trozas.
 *
 * Convenio de bordes, siempre con `>=`: 0-14 · 15-29 · 30-59 · 60 o más.
 *
 * PURO y client-safe, sin dependencias: lo importan `patio-resumen`,
 * `patio-filtros`, `patio-por-permiso` y `trozas-patio` sin armar un ciclo.
 */

/**
 * Los bordes de la escala, en días. `[15, 30, 60]`:
 *
 * - **15** — una troza rolliza en selva empieza a mancharse y a rajarse; desde
 *   ahí lo que se pierde es precio («añeja»). Quincenas, no horas: un umbral
 *   que se dispara todos los días deja de mirarse.
 * - **30** — un mes: ya no es espera de turno, es madera olvidada.
 * - **60** — «varada»: el mismo corte que la tira de pendientes del libro
 *   (`TROZAS_VARADAS_DIAS`, `ctp-pendientes.ts`).
 */
export const TRAMOS_DIAS_PATIO = [15, 30, 60] as const;

/**
 * Las claves de los cuatro tramos.
 *
 * ⚠️ Son identificadores ESTABLES del contrato (ADR-431), no el rango: con el
 * convenio `>=` la clave `"16a30"` cubre de 15 a 29 días. El texto que se
 * muestra sale SIEMPRE de `ETIQUETA_TRAMO_DIAS`, nunca de la clave.
 */
export type TramoDias = "hasta15" | "16a30" | "31a60" | "mas60";

/** En el orden en que se degrada la madera: para leyendas, columnas y filtros. */
export const TRAMOS_DIAS: readonly TramoDias[] = ["hasta15", "16a30", "31a60", "mas60"];

/** El rango escrito: se puede verificar contra la fecha, un adjetivo suelto no. */
export const ETIQUETA_TRAMO_DIAS: Record<TramoDias, string> = {
  hasta15: "0 a 14 días",
  "16a30": "15 a 29 días",
  "31a60": "30 a 59 días",
  mas60: "60 días o más",
};

/** La misma escala en corto, para una cabecera o un chip angosto. */
export const ETIQUETA_CORTA_TRAMO_DIAS: Record<TramoDias, string> = {
  hasta15: "0-14 d",
  "16a30": "15-29 d",
  "31a60": "30-59 d",
  mas60: "60+ d",
};

/**
 * La severidad EN TEXTO, para que el tramo nunca vaya sólo en color (WCAG
 * 1.4.1): «añeja» desde el primer borde, «varada» desde el último.
 */
export const SEVERIDAD_TRAMO_DIAS: Record<TramoDias, "fresca" | "añeja" | "varada"> = {
  hasta15: "fresca",
  "16a30": "añeja",
  "31a60": "añeja",
  mas60: "varada",
};

/** El tono del DS por tramo (`--data-success/warning/error`). */
export const TONO_TRAMO_DIAS: Record<TramoDias, "ok" | "warn" | "danger"> = {
  hasta15: "ok",
  "16a30": "warn",
  "31a60": "warn",
  mas60: "danger",
};

/** En qué tramo cae una cantidad de días. `null` sin dato: no se inventa un tramo. */
export function tramoDeDias(dias: number | null | undefined): TramoDias | null {
  if (dias == null || !Number.isFinite(dias)) return null;
  const [anejo, mes, varada] = TRAMOS_DIAS_PATIO;
  if (dias >= varada) return "mas60";
  if (dias >= mes) return "31a60";
  if (dias >= anejo) return "16a30";
  return "hasta15";
}

/** Lo que hace falta de una troza para contar sus días. */
export interface FechasDeTroza {
  /** Cuándo bajó del camión (ADR-336). */
  fechaRecepcion?: string | Date | null;
  /** El asiento de la guía en el libro — NO es la recepción. */
  fechaIngreso?: string | Date | null;
  /** `false` = la guía sigue en la bandeja: la madera no bajó (ADR-339). */
  guiaRecepcionada?: boolean;
}

const diaUtc = (x: Date) => Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());

const aFecha = (v: string | Date | null | undefined): Date | null => {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/**
 * Días que lleva parada una pieza, por DÍA UTC (nunca por hora): cuenta desde
 * que bajó del camión si se sabe; si no, desde el asiento de su guía.
 *
 * Por día y no por milisegundos: con `Math.floor` sobre las horas, la misma
 * troza cambiaba de tramo a media tarde según a qué hora se mirara.
 */
export function diasParada(t: FechasDeTroza, hoy: Date): number | null {
  const d = aFecha(t.fechaRecepcion) ?? aFecha(t.fechaIngreso);
  if (!d) return null;
  return Math.max(0, Math.round((diaUtc(hoy) - diaUtc(d)) / 86_400_000));
}

/**
 * Días EN EL PATIO. La madera cuya guía no se recepcionó no está en el patio:
 * su única fecha es la del asiento, y presentarla como «16 días en el patio»
 * sería un derivado disfrazado de dato (ADR-431, C7). Para esas va
 * `diasDelAsiento`, rotulado aparte.
 */
export function diasEnPatio(t: FechasDeTroza, ahora: Date): number | null {
  if (t.guiaRecepcionada === false) return null;
  return diasParada(t, ahora);
}

/** Días desde que se ASENTÓ la guía, para la madera que todavía no se recibió. */
export function diasDelAsiento(t: FechasDeTroza, ahora: Date): number | null {
  return diasParada({ fechaIngreso: t.fechaIngreso }, ahora);
}

/** El tramo de una pieza: el que ven la columna, el filtro y la KPI. */
export function tramoDeTroza(t: FechasDeTroza, ahora: Date): TramoDias | null {
  return tramoDeDias(diasEnPatio(t, ahora));
}

/** Un conteo en cero por tramo, para acumular. */
export function tramosEnCero(): Record<TramoDias, number> {
  return { hasta15: 0, "16a30": 0, "31a60": 0, mas60: 0 };
}
