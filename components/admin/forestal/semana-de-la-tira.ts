/**
 * Lo que la tira suma de sus siete casilleros (ADR-445, 27-09): el total de la
 * semana y los chips «3 por tipo · 1 sin guía».
 *
 * Vive aparte del hook que lee la semana (`use-jornadas-produccion`) a
 * propósito: varios tests mockean ese módulo entero, y una función pura
 * adentro desaparecía con el mock (medido: «No "totalDeLaSemana" export is
 * defined on the mock» en el acta de trozas).
 */

import { chipsDeLaSemana, type ChipDeLaSemana } from "./marcas-del-dia";
import type { JornadaDeProduccion } from "./hooks/use-jornadas-produccion";

/** Lo de una semana, sumado de sus casilleros: la semana y sus días cierran a la vista. */
export interface TotalDeLaSemana {
  corridas: number;
  pt: number;
  m3: number;
  piezas: number;
}

export function totalDeLaSemana(
  dias: readonly string[],
  porDia: ReadonlyMap<string, JornadaDeProduccion>,
): TotalDeLaSemana {
  const t = { corridas: 0, pt: 0, m3: 0, piezas: 0 };
  for (const d of dias) {
    const j = porDia.get(d);
    if (!j) continue;
    t.corridas += j.corridas;
    t.pt += j.pt;
    t.m3 += j.m3;
    t.piezas += j.piezas;
  }
  return { ...t, m3: Math.round(t.m3 * 10000) / 10000 };
}

/** «3 por tipo · 1 sin guía»: los días de la semana por marca (ADR-445). */
export const chipsDeLosDias = (
  dias: readonly string[],
  porDia: ReadonlyMap<string, JornadaDeProduccion>,
): ChipDeLaSemana[] => chipsDeLaSemana(dias.map((d) => porDia.get(d)?.origenYSalida));
