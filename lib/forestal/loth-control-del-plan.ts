/**
 * loth-control-del-plan — de qué plan habla el encabezado de «Control del
 * permiso» (ficha, planes vivos, saldo por especie, cuadre por guía e informe).
 *
 * Manda el permiso del chip del libro (04-10, igual que la tabla): con un plan
 * puntual elegido, todo el encabezado es de ESE plan. Con «Todos» o con
 * «Líneas sin permiso» no hay un plan que mostrar en la ficha: sigue el plan
 * activo del libro (`?active=1`), como antes.
 *
 * Puro y sin fetch: la pantalla y el PDF llaman a lo mismo y no pueden decir
 * cifras distintas.
 */

import { planesVivos, type PlanFicha, type PlanFichaApi } from "./loth-ficha-permiso";
import type { CuadreGuia } from "./loth-cuadre-guias";
import { PLAN_SIN_PLAN, type TrozaTablero } from "./loth-tablero-trozas";

type PlanConId = PlanFicha & { id: string };

export interface PlanDelControl {
  /** El plan del chip, si es uno puntual; `null` con «Todos» o «Líneas sin permiso». */
  puntual: string | null;
  /** Contra qué plan se miden la ficha, el saldo y el cuadre: el puntual o el activo. */
  id: string | null;
  /**
   * La ficha de ese plan. Con un puntual que todavía no está en la lista (la
   * lista no llegó), `null`: mostrar el activo en su lugar sería mostrar otro papel.
   */
  plan: PlanConId | null;
  /** Los planes vivos, el que se mira primero. */
  vivos: PlanFichaApi[];
}

export function planDelControl(
  planSel: string | null | undefined,
  planes: readonly PlanFichaApi[] | null,
  planActivo: PlanConId | null,
): PlanDelControl {
  const puntual = planSel && planSel !== PLAN_SIN_PLAN ? planSel : null;
  const id = puntual ?? planActivo?.id ?? null;
  const vivos = planesVivos(planes ?? [], id);
  if (puntual) {
    const plan = planes?.find((p) => p.id === puntual) ?? (planActivo?.id === puntual ? planActivo : null);
    return { puntual, id, plan, vivos };
  }
  // Sin `?active=1`, el primero vivo (lo de siempre).
  return { puntual, id, plan: planActivo ?? vivos[0] ?? null, vivos };
}

/** Las trozas del plan puntual; con «Todos» o «Líneas sin permiso», todas (como antes). */
export function trozasDelControl(filas: readonly TrozaTablero[], puntual: string | null): readonly TrozaTablero[] {
  return puntual ? filas.filter((f) => f.planId === puntual) : filas;
}

/**
 * Las guías que tocan al plan puntual: las que cita al menos una de sus trozas.
 * El cruce de cada guía se hace con TODAS sus trozas (antes de filtrar): una
 * guía que lleva madera de dos planes declara el total, y cortarla por plan la
 * haría «no cuadrar» sin que nada esté mal. Una guía registrada que ninguna
 * troza cita no es de ningún plan: sólo se ve con «Todos».
 */
export function cuadreDelControl(
  cuadre: readonly CuadreGuia[] | null,
  filas: readonly TrozaTablero[],
  puntual: string | null,
): CuadreGuia[] | null {
  if (!cuadre || !puntual) return cuadre ? [...cuadre] : null;
  const delPlan = new Set(trozasDelControl(filas, puntual).map((f) => f.code));
  return cuadre.filter((g) => g.codigos.some((c) => delPlan.has(c)));
}
