"use client";

/**
 * Lo que el censo sabe de UN árbol (DAP, Hc, volumen estimado, categoría,
 * condición del regente), para la cabecera de la ficha cuando no hay un plan
 * elegido en pantalla — «Trozar un árbol» parte de la tala, no del plan.
 *
 * Primero el plan del árbol (`?treeCode=`, una consulta), después el censo de
 * ESE plan por `useCensoDeTala`, que ya recuerda la lectura 30 s por plan: el
 * mismo cruce que ve «Nueva línea · Trozado».
 */

import { useEffect, useState } from "react";
import type { ArbolParaElegir } from "@/lib/forestal/loth-censo-uso";
import { logger } from "@/lib/logger";
import { useCensoDeTala } from "./use-censo-de-tala";

export function useArbolDelCenso(treeCode: string): { arbol: ArbolParaElegir | null; cargando: boolean } {
  const code = treeCode.trim();
  const [plan, setPlan] = useState<{ code: string; planId: string | null } | null>(null);

  useEffect(() => {
    if (!code) return;
    let cancelado = false;
    fetch(`/api/admin/forestal/plan/census?treeCode=${encodeURIComponent(code)}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { tree?: { planId?: string | null } | null } | null) => {
        if (!cancelado) setPlan({ code, planId: j?.tree?.planId ?? null });
      })
      .catch((err: unknown) => {
        // Sin censo la ficha igual muestra la tala y lo que queda.
        if (!cancelado) setPlan({ code, planId: null });
        logger.error("[useArbolDelCenso] plan del árbol failed", { error: String(err) });
      });
    return () => {
      cancelado = true;
    };
  }, [code]);

  const planId = plan?.code === code ? plan.planId : null;
  const censo = useCensoDeTala(planId, Boolean(planId));
  const buscandoPlan = Boolean(code) && plan?.code !== code;
  return {
    arbol: planId ? (censo.arboles.find((a) => a.treeCode === code) ?? null) : null,
    cargando: buscandoPlan || censo.cargando,
  };
}
