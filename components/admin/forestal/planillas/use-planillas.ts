"use client";

/**
 * Las planillas (catálogo fijo, viaja con la pantalla) + los prompts que el
 * negocio guardó para algunas. Mientras se leen, o si fallan, cada tarjeta
 * muestra el prompt de fábrica: imprimir y bajar el Excel no esperan a nadie.
 */
import { useCallback, useEffect, useState } from "react";
import { PLANILLAS } from "@/lib/forestal/planillas/catalogo";
import type { PlanillaCampo, PlanillaId, PromptGuardado } from "@/lib/forestal/planillas/tipos";
import { traerPromptsGuardados } from "./planillas-api";

export type PromptsGuardados = Partial<Record<PlanillaId, PromptGuardado>>;

export interface EstadoPlanillas {
  planillas: readonly PlanillaCampo[];
  guardados: PromptsGuardados;
  cargando: boolean;
  error: string | null;
  recargar: () => void;
  /** Tras guardar (o volver al de fábrica = `null`) en la ventana del prompt. */
  alCambiarPrompt: (id: PlanillaId, guardado: PromptGuardado | null) => void;
}

export function usePlanillas(): EstadoPlanillas {
  const [guardados, setGuardados] = useState<PromptsGuardados>({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setCargando(true);
    setError(null);
    traerPromptsGuardados(ac.signal)
      .then((lista) => {
        const m: PromptsGuardados = {};
        for (const g of lista) m[g.planillaId] = g;
        setGuardados(m);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!ac.signal.aborted) setCargando(false);
      });
    return () => ac.abort();
  }, [vuelta]);

  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  const alCambiarPrompt = useCallback((id: PlanillaId, g: PromptGuardado | null) => {
    setGuardados((prev) => {
      const next = { ...prev };
      if (g) next[id] = g;
      else delete next[id];
      return next;
    });
  }, []);

  return { planillas: PLANILLAS, guardados, cargando, error, recargar, alCambiarPrompt };
}

/** ¿El prompt guardado se escribió sobre una versión de fábrica anterior a la de hoy? */
export function promptDesactualizado(planilla: PlanillaCampo, guardado: PromptGuardado | undefined | null): boolean {
  return guardado != null && guardado.basadoEnVersion < planilla.versionPrompt;
}
