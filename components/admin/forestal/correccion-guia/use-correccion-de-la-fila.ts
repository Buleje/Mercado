"use client";

/**
 * El pedido de corrección de UNA fila (ADR-512): lo lee del proveedor de la
 * lista (que hizo la única llamada) y guarda si el modal está abierto desde la
 * fila o desde otra ventana (entonces va `aboveModals`).
 */

import { useState } from "react";
import type { SolicitudCorreccionDTO } from "@/lib/soporte/correccion-guia";
import { useCorreccionesCtx } from "./contexto";

export interface CorreccionDeLaFila {
  solicitud: SolicitudCorreccionDTO | null;
  /** Pendiente o En revisión: no se pide otra. */
  abierta: boolean;
  /** Hay proveedor y la guía está viva: se ofrece «Pedir corrección». */
  puede: boolean;
  /** Dónde se abrió el modal: la fila o encima de otra ventana. */
  desde: "fila" | "ventana" | null;
  abrir: (desde: "fila" | "ventana") => void;
  cerrar: () => void;
}

export function useCorreccionDeLaFila(entityId: string, viva: boolean): CorreccionDeLaFila {
  const ctx = useCorreccionesCtx();
  const [desde, setDesde] = useState<"fila" | "ventana" | null>(null);
  const solicitud = ctx?.de(entityId) ?? null;
  return {
    solicitud,
    abierta: solicitud?.estado === "open" || solicitud?.estado === "in_review",
    puede: !!ctx && viva,
    desde,
    abrir: setDesde,
    cerrar: () => setDesde(null),
  };
}
