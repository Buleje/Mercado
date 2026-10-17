"use client";

/**
 * piezas/use-rubro-plan.ts — el rubro de las plantillas que más se parece a
 * lo que dice la ficha del negocio (ADR-497). «Bodega» si no dice nada.
 */
import { useSeccionPlan } from "@/hooks/use-plan-empresa";
import { rubroDeTexto, type RubroPlantilla } from "@/lib/planificacion/plantillas-politicas";

export function useRubroPlan(): RubroPlantilla {
  const { datos } = useSeccionPlan("ficha");
  return rubroDeTexto(`${datos.rubro} ${datos.tipoNegocio}`);
}
