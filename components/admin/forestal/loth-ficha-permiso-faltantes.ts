"use client";

/**
 * Lo que le falta a la ficha del permiso, agrupado por la pantalla que lo
 * arregla (carátula o plan), con el «Completar» de cada grupo. Lo comparten la
 * ficha entera (`LothFichaPermiso`) y su línea compacta del Control
 * (`LothFichaPermisoLinea`): los dos dicen lo mismo y abren lo mismo.
 */

import { useMemo } from "react";
import type { CaratulaFicha, DondeCompletar, FichaPermiso } from "@/lib/forestal/loth-ficha-permiso";
import { primerPasoIncompleto, queFalta, type PasoCaratula } from "@/lib/forestal/loth-caratula-pasos";

export interface GrupoFaltante {
  donde: DondeCompletar;
  textos: string[];
  /** Abre la pantalla que lo arregla; `undefined` si quien monta no la ofrece. */
  completar?: () => void;
}

export function useFaltantesFicha(
  f: FichaPermiso,
  caratula: CaratulaFicha | null | undefined,
  onCompletarCaratula?: (paso: PasoCaratula) => void,
  onCompletarPlan?: () => void,
): GrupoFaltante[] {
  /* Un «Completar» por pantalla que lo arregla, no uno por dato: la vigencia y
     la parcela se cargan en el mismo formulario del plan. */
  const faltasCaratula = useMemo(() => (caratula ? queFalta(caratula) : []), [caratula]);
  /* «Completar carátula» cae en el primer paso que falta (título → titular → libro). */
  const pasoQueFalta = useMemo(() => primerPasoIncompleto(caratula), [caratula]);
  return useMemo(() => {
    const orden: DondeCompletar[] = ["caratula", "plan"];
    return orden
      .map((donde): GrupoFaltante => {
        const textos = f.faltantes.filter((x) => x.completar === donde).map((x) => x.texto);
        // Carátula cargada pero incompleta (registro, tomo, RUC…): lo dice y ofrece el paso que falta.
        if (donde === "caratula" && textos.length === 0 && faltasCaratula.length > 0) {
          const nombres = faltasCaratula.map((x) => x.texto.replace(/^(el|la) /, ""));
          const resto = nombres.length - 2;
          textos.push(`Falta en la carátula: ${nombres.slice(0, 2).join(", ")}${resto > 0 ? ` y ${resto} más` : ""}`);
        }
        const completar =
          donde === "caratula"
            ? onCompletarCaratula
              ? () => onCompletarCaratula(pasoQueFalta)
              : undefined
            : onCompletarPlan;
        return { donde, textos, completar };
      })
      .filter((g) => g.textos.length > 0);
  }, [f.faltantes, faltasCaratula, pasoQueFalta, onCompletarCaratula, onCompletarPlan]);
}
