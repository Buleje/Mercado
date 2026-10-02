"use client";

/**
 * «Despachar con guía» llegando con trozas ya elegidas (ADR-459): desde el
 * Control del permiso se marcan (o se escanean) las trozas del patio y el
 * modal abre con ESAS en la lista.
 *
 * La guía sale de UN plan (`useDespachoGuiaLoth` filtra las trozas por el plan
 * elegido y, al sembrar, limpia la selección). Por eso esto:
 *   1. espera a que llegue lo preparado;
 *   2. pone el plan de esas trozas (si son de uno solo);
 *   3. elige las trozas recién cuando ese plan ya se sembró — el efecto del
 *      hook corre antes que éste en el mismo pase, así que lo que se elige acá
 *      queda encima de su `setElegidas(new Set())`.
 * Lo que el servidor ya no ofrece (salió, se consumió) se avisa, no se calla.
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";

export function useTrozasDeAntes(g: DespachoGuiaLoth, codigos: readonly string[] | undefined): string | null {
  const hecho = useRef(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const { prep, planId, identidad, talonario, setPlanId, setElegidas } = g;

  useEffect(() => {
    if (hecho.current || !codigos || codigos.length === 0 || !prep) return;
    const pedidas = new Set(codigos);
    const halladas = prep.trozas.filter((t) => pedidas.has(t.codigo));
    const planes = [...new Set(halladas.map((t) => t.planId ?? null))];
    if (halladas.length === 0 || planes.length !== 1) {
      hecho.current = true;
      setAviso(
        halladas.length === 0
          ? "Las trozas que elegiste ya no están para despachar (salieron o se consumieron)."
          : `Las trozas que elegiste son de ${planes.length} permisos: la guía sale de uno solo. Elígelas en la lista.`,
      );
      return;
    }
    const plan = planes[0] ?? null;
    if (planId !== plan) {
      setPlanId(plan);
      return;
    }
    if (!identidad || !talonario) return;
    hecho.current = true;
    setElegidas(new Set(halladas.map((t) => t.codigo)));
    const faltan = codigos.length - halladas.length;
    if (faltan > 0) setAviso(`${faltan} de las ${codigos.length} trozas que elegiste ya no están para despachar.`);
  }, [codigos, prep, planId, identidad, talonario, setPlanId, setElegidas]);

  return aviso;
}

export default function AvisoTrozasDeAntes({ aviso }: { aviso: string | null }) {
  if (!aviso) return null;
  return (
    <p role="status" className="flex items-center gap-2 text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      {aviso}
    </p>
  );
}
