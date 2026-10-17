"use client";

/**
 * useEspeciesAMano — la especie de las trozas a mano juzgada en la pantalla con
 * las MISMAS reglas que el servidor al registrar (revisión 15-10: el 422 del
 * catálogo y el rechazo de T7 llegaban recién al Registrar, con N filas ya
 * cargadas).
 *
 *  - Catálogo: `especieDelCatalogo`, sólo cuando el catálogo terminó de leerse.
 *  - Permiso: `rechazoT7` contra las especies del plan de la guía
 *    (`GET /plan/species?planId=`); sin plan, o si no se pudo leer, no se juzga
 *    (el servidor lo vuelve a decidir igual).
 *
 * Devuelve el juicio por especie, las del catálogo que el permiso autoriza (para
 * separarlas en el desplegable) y los faltantes que frenan «Registrar».
 */

import { useEffect, useMemo, useState } from "react";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import { esPlanDePlantacion, type PlanParaPoa } from "@/lib/forestal/loth-poa";
import type { EspecieRegistrada } from "@/lib/forestal/loth-plan-especie";
import type { FaltanteLoth } from "@/lib/forestal/loth-guia-despacho";
import {
  especiesDelPermiso,
  problemaDeEspecieAMano,
  type ContextoEspecieAMano,
  type ProblemaEspecieAMano,
  type TrozaAMano,
} from "@/lib/forestal/loth-trozas-a-mano";
import type { CatalogoUI } from "../ctp-especie-campo";

export type CatalogoParaJuzgar = Pick<CatalogoUI, "listo" | "catalogo" | "nombres" | "cientificoDe">;

/** Las especies del permiso de la guía; `null` = sin plan, cargando o no se pudo leer. */
function useRegistroDelPermiso(planId: string | null): EspecieRegistrada[] | null {
  const [leido, setLeido] = useState<{ planId: string; registro: EspecieRegistrada[] } | null>(null);
  useEffect(() => {
    if (!planId) return;
    const ac = new AbortController();
    fetch(`/api/admin/forestal/plan/species?planId=${encodeURIComponent(planId)}`, {
      credentials: "include",
      cache: "no-store",
      signal: ac.signal,
    })
      .then(async (r) => {
        if (!r.ok) return;
        const j = (await r.json()) as { species?: { speciesCommon?: unknown; speciesScientific?: unknown }[] };
        const registro = (j.species ?? [])
          .filter((s): s is { speciesCommon: string; speciesScientific?: unknown } => typeof s.speciesCommon === "string")
          .map((s) => ({
            speciesCommon: s.speciesCommon,
            speciesScientific: typeof s.speciesScientific === "string" ? s.speciesScientific : null,
          }));
        setLeido({ planId, registro });
      })
      /* Sin la lista no se juzga en pantalla: T7 lo decide igual al registrar. */
      .catch(() => undefined);
    return () => ac.abort();
  }, [planId]);
  return planId && leido?.planId === planId ? leido.registro : null;
}

export interface EspeciesAMano {
  problemaDe: (especie: string | null | undefined) => ProblemaEspecieAMano | null;
  /** Las del catálogo que autoriza el permiso; `null` = no hay permiso que separe. */
  delPermiso: string[] | null;
  /** Una por especie con problema: frenan «Registrar» antes del 422. */
  faltan: FaltanteLoth[];
}

export function useEspeciesAMano({
  catalogo,
  planId,
  plan,
  filas,
}: {
  catalogo: CatalogoParaJuzgar | undefined;
  planId: string | null;
  plan: PlanParaPoa | null;
  filas: readonly TrozaAMano[];
}): EspeciesAMano {
  const registro = useRegistroDelPermiso(planId);
  const plantacion = esPlanDePlantacion(plan);
  const listo = catalogo?.listo ?? false;
  const crudo = catalogo?.catalogo;
  const nombres = catalogo?.nombres;
  const cientificoDe = catalogo?.cientificoDe;

  return useMemo(() => {
    const ctx: ContextoEspecieAMano = {
      catalogo: listo && crudo ? crudo : null,
      permiso: registro ? { registro, plantacion } : null,
    };
    const problemaDe = (especie: string | null | undefined) => problemaDeEspecieAMano(especie, ctx);
    const delPermiso =
      registro && registro.length > 0 && nombres && cientificoDe ? especiesDelPermiso(nombres, cientificoDe, registro) : null;
    const faltan = new Map<string, FaltanteLoth>();
    for (const f of filas) {
      const p = problemaDe(f.especie);
      const k = claveEspecie(f.especie);
      if (p && !faltan.has(k)) faltan.set(k, { seccion: "trozas", campo: `Especie ${f.especie?.trim()} (a mano)`, motivo: p.motivo });
    }
    return { problemaDe, delPermiso, faltan: [...faltan.values()] };
  }, [listo, crudo, nombres, cientificoDe, registro, plantacion, filas]);
}
