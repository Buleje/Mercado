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
 *
 * El mismo código puede estar en dos permisos (el QR por línea existe por eso):
 * si quien abre ya sabe de qué permiso son —el escaneo lo fijó con la primera
 * troza, el Control con su selección—, el código en OTRO permiso es otra
 * troza y no cuenta (si no, salía «son de 2 permisos» con un solo permiso).
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "@buleje/design-system/icons";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";

/** Lo que llega elegido. `planes` ausente = no se sabe de qué permiso son. */
export interface TrozasIniciales {
  codigos: readonly string[];
  planes?: readonly (string | null)[];
}

/** Las pedidas que el servidor todavía ofrece, sólo de los permisos de lo elegido (si se saben). */
export function trozasPedidas<T extends { codigo: string; planId?: string | null }>(
  trozas: readonly T[],
  pedido: TrozasIniciales,
): T[] {
  const codigos = new Set(pedido.codigos);
  const planes = pedido.planes ? new Set(pedido.planes) : null;
  return trozas.filter((t) => codigos.has(t.codigo) && (!planes || planes.has(t.planId ?? null)));
}

export function useTrozasDeAntes(g: DespachoGuiaLoth, pedido: TrozasIniciales | undefined): string | null {
  const hecho = useRef(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const { prep, planId, identidad, talonario, setPlanId, setElegidas } = g;

  useEffect(() => {
    if (hecho.current || !pedido || pedido.codigos.length === 0 || !prep) return;
    const { codigos } = pedido;
    const halladas = trozasPedidas(prep.trozas, pedido);
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
  }, [pedido, prep, planId, identidad, talonario, setPlanId, setElegidas]);

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
