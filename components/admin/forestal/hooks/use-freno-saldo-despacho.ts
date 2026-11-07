"use client";

/**
 * El freno del saldo, ANTES de registrar el despacho con guía (24-10, Brandon:
 * «una guía que se pasa se frena: te pasas por 3,2 m³»). Con plan, lee su
 * saldo y lo cruza con las piezas (`frenoDeSaldo`); sin plan, el de CADA plan
 * vigente con especies (`frenoSinPlan`, 25-10): lo sin plan cuenta en todos y
 * el servidor lo mide contra todos. Sólo avisa: quien decide es el 422 del
 * servidor (`T6_EXCESO_AUTORIZADO`), que dice el mismo mensaje. Lo sin plan que
 * ningún vigente autoriza es un aviso y el servidor tampoco lo frena (25-10).
 */

import { useMemo } from "react";
import { frenoDeSaldo, frenoSinPlan, type FrenoDeSaldo, type PiezaParaFreno } from "@/lib/forestal/loth-saldo-cascada";
import { useSaldoDelPlan, useSaldosDeLoSinPlan } from "./use-loth-saldo-plan";

const SIN_FRENO: FrenoDeSaldo = { bloqueos: [], avisos: [] };

export function useFrenoSaldoDespacho(
  /** El plan de la guía; `null` = trozas sin plan; `undefined` = todavía no se sabe (no pide nada). */
  planId: string | null | undefined,
  piezas: readonly PiezaParaFreno[],
): FrenoDeSaldo {
  const { dato: conPlan } = useSaldoDelPlan(planId);
  const { dato: sinPlan } = useSaldosDeLoSinPlan(planId === null);
  return useMemo(() => {
    if (piezas.length === 0) return SIN_FRENO;
    if (planId === null) return sinPlan ? frenoSinPlan(sinPlan.planes, piezas) : SIN_FRENO;
    if (!conPlan?.saldo) return SIN_FRENO;
    return frenoDeSaldo(conPlan.saldo, conPlan.delPlan, piezas, conPlan.plan.nombre);
  }, [planId, conPlan, sinPlan, piezas]);
}
