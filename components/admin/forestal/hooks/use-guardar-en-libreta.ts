/**
 * «Guardar en la libreta» de los bloques de la guía (despacho del CTP, guía de
 * una línea, datos de la GTF y guía del Libro TH): una sola regla para los
 * cuatro. La decisión vive en `planGuardado` (sin React, con test); acá sólo se
 * guarda y se anota el uso.
 *
 * Revisión 16-10-2026: un establecimiento que comparte RUC con otra ficha ya no
 * le pisa la dirección; devuelve el choque para que la barra pregunte.
 */

import { useCallback } from "react";
import type { Parte, ParteInput } from "@/lib/forestal/directorio";
import { planGuardado, type GuardarEnLibreta } from "@/lib/forestal/libreta";

interface DirectorioParaGuardar {
  /** La libreta entera, inactivos incluidos: el servidor también une con ellos. */
  partes: Parte[];
  guardarParte: (input: ParteInput & { id?: string }) => Promise<Parte>;
}

export function useGuardarEnLibreta(directorio: DirectorioParaGuardar, anotar: (p: Parte) => void): GuardarEnLibreta {
  const { partes, guardarParte } = directorio;
  return useCallback<GuardarEnLibreta>(
    async (v, rol, aparte) => {
      const plan = planGuardado(v, rol, partes, aparte);
      if ("choque" in plan) return plan.choque;
      anotar(await guardarParte(plan.input));
    },
    [partes, guardarParte, anotar],
  );
}
