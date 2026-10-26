"use client";

/**
 * «Corregir» del aviso de un bloque que se pasa (Brandon 25-10): lleva a la
 * pestaña del saldo y a las preliminares que lo hacen pasar, resaltadas unos
 * segundos; sin preliminares (lo registrado solo ya lo pasa), a los bloques.
 * Sin ids y sin bloques, a la lista de preliminares (el «Ver» de siempre).
 */

import { useEffect, useRef, useState } from "react";
import { ID_PRELIMINARES } from "../LothPlanPreliminares";

/** El cuerpo de «Por bloque o zona» (el `id` de `BloquePlan` es sólo para su título). */
export const ID_BLOQUES = "bloques-del-plan";

const RESALTE_MS = 8000;

export function useIrAPreliminares(abrirPestana: () => void) {
  const [resaltadas, setResaltadas] = useState<string[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const ir = (ids: readonly string[] = [], aLosBloques = false) => {
    abrirPestana();
    setResaltadas([...ids]);
    if (timer.current) clearTimeout(timer.current);
    if (ids.length > 0) timer.current = setTimeout(() => setResaltadas([]), RESALTE_MS);
    requestAnimationFrame(() => {
      const primera = ids[0] ? document.querySelector(`[data-preliminar-id="${CSS.escape(ids[0])}"]`) : null;
      const destino = primera ?? (aLosBloques ? document.getElementById(ID_BLOQUES) : null) ?? document.getElementById(ID_PRELIMINARES);
      destino?.scrollIntoView({ block: primera ? "center" : "start", behavior: "smooth" });
    });
  };
  return { resaltadas, ir };
}
