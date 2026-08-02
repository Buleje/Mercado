/**
 * Lo que la planta pregunta de un lote: cuánto se armó, cuánto salió y cuánto
 * queda — en m³ y en pie tablar.
 *
 * Vive acá y no dentro del módulo porque el mismo cálculo lo va a querer el
 * export y el detalle: si cada uno sumara por su cuenta, la tarjeta de arriba y
 * la tabla de abajo podrían decir cifras distintas del mismo lote.
 *
 * El PT sale de `PT_POR_M3` (423.78), la MISMA constante del cubicador: la
 * conversión no se re-escribe por ahí, o dos pantallas convierten distinto.
 */

import { PT_POR_M3 } from "./cubicacion";

export interface LoteMedible {
  unit: string;
  /** Suma de las corridas que arman el lote. */
  totalCantidad: number;
  /** Lo que ya salió en despachos vivos. */
  despachado: number;
  /** `totalCantidad − despachado`, nunca negativo. */
  disponible: number;
  status?: string;
}

export interface ResumenLotes {
  /** Cuántos lotes entraron en la suma (los que miden en m³). */
  lotesEnM3: number;
  /** Lotes en otra unidad (kg, unidad, pt): NO se suman a los m³. */
  lotesOtraUnidad: number;
  armadoM3: number;
  despachadoM3: number;
  disponibleM3: number;
  armadoPt: number;
  despachadoPt: number;
  disponiblePt: number;
  /** despachado / armado, en PORCENTAJE. `null` si todavía no se armó nada. */
  avancePct: number | null;
}

const r4 = (n: number) => Number(n.toFixed(4));
const r1 = (n: number) => Number(n.toFixed(1));

/** m³ → pie tablar. Un valor no finito devuelve 0, no `NaN` en pantalla. */
export function enPieTablar(m3: number): number {
  return Number.isFinite(m3) ? r1(m3 * PT_POR_M3) : 0;
}

/**
 * Suma SÓLO los lotes que miden en m³.
 *
 * Un lote en kg y otro en m³ no se suman: el total sería un número sin unidad
 * que parece exacto. Los otros se cuentan aparte para poder decir "hay 3 lotes
 * más en otra unidad" en vez de esconderlos.
 *
 * Los anulados no cuentan: ese lote dejó de existir como acuerdo comercial.
 */
export function resumenLotes(lotes: ReadonlyArray<LoteMedible>): ResumenLotes {
  const vivos = lotes.filter((l) => l.status !== "anulado");
  const enM3 = vivos.filter((l) => l.unit === "m3");

  const armadoM3 = r4(enM3.reduce((a, l) => a + (Number(l.totalCantidad) || 0), 0));
  const despachadoM3 = r4(enM3.reduce((a, l) => a + (Number(l.despachado) || 0), 0));
  const disponibleM3 = r4(enM3.reduce((a, l) => a + (Number(l.disponible) || 0), 0));

  return {
    lotesEnM3: enM3.length,
    lotesOtraUnidad: vivos.length - enM3.length,
    armadoM3,
    despachadoM3,
    disponibleM3,
    armadoPt: enPieTablar(armadoM3),
    despachadoPt: enPieTablar(despachadoM3),
    disponiblePt: enPieTablar(disponibleM3),
    avancePct: armadoM3 > 0 ? Number(((despachadoM3 / armadoM3) * 100).toFixed(1)) : null,
  };
}

/**
 * En qué punto está la salida de UN lote, para pintar la barra de avance.
 *
 * `completo` no se deriva de `disponible === 0` sino del estado: un lote puede
 * estar en 0 disponible porque todavía no se le cargó ninguna corrida.
 */
export function avanceDeLote(l: LoteMedible): {
  pct: number;
  completo: boolean;
  sinArmar: boolean;
} {
  const armado = Number(l.totalCantidad) || 0;
  if (armado <= 0) return { pct: 0, completo: false, sinArmar: true };
  const pct = Math.min(100, Math.max(0, ((Number(l.despachado) || 0) / armado) * 100));
  return { pct: Number(pct.toFixed(1)), completo: pct >= 99.95, sinArmar: false };
}
