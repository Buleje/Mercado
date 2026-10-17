"use client";

/**
 * Libro TH › Control del permiso — Trozas · Kárdex · Extracción (plan «panel
 * unificado», F32, ola 2 — 2026-10-10).
 *
 * «Extracción» (ADR-454) era una vista aparte del grupo Gestión y contesta la
 * misma pregunta que el Control —«¿cuánto le queda a este permiso?»— desde el
 * censo: aprobado contra talado, trozado y despachado. Ahora es una pestaña
 * del Control, y el selector «Trozas / Kárdex» que vivía a media pantalla sube
 * a la misma fila: dos niveles (el riel y esta fila), nunca tres (regla R4).
 *
 * Cada pestaña monta lo de siempre: el tablero de trozas (con su pestaña
 * elegida desde acá) y `LothExtraccionView` tal cual.
 */

import { useState, type ReactNode } from "react";
import { Axe, History, LayoutGrid } from "@buleje/design-system/icons";
import PestanasDeVista, { type PestanaDeVista } from "./PestanasDeVista";
import { usePestanaInterna } from "./hooks/use-pestana-interna";

export const SUBS_CONTROL = ["trozas", "kardex", "extraccion"] as const;
export type SubControl = (typeof SUBS_CONTROL)[number];

const PESTANAS: readonly PestanaDeVista<SubControl>[] = [
  { id: "trozas", label: "Trozas", icon: LayoutGrid, hint: "Cada troza del permiso con su estado y su antigüedad en el patio" },
  { id: "kardex", label: "Kárdex", icon: History, hint: "Cada movimiento con su saldo" },
  { id: "extraccion", label: "Extracción", icon: Axe, hint: "Censo − tala, trozado y despacho por permiso" },
];

/** Un `?vista=extraccion` viejo (o guardado) abre la pestaña Extracción. */
function subPorVistaVieja(): SubControl | undefined {
  if (typeof window === "undefined") return undefined;
  return new URLSearchParams(window.location.search).get("vista") === "extraccion" ? "extraccion" : undefined;
}

export default function LothControlPestanas({
  extraccion,
  pedido,
  children,
}: {
  /** La vista Extracción (la arma el libro: necesita su señal de recarga y su navegación). */
  extraccion: ReactNode;
  pedido: { sub: string; n: number } | null;
  /**
   * El tablero de trozas, con la pestaña («trozas» o «kardex») que eligió esta
   * fila y cómo pedirle otra (el escáner salta de Kárdex a Trozas).
   */
  children: (pestana: "trozas" | "kardex", irAPestana: (p: "trozas" | "kardex") => void) => ReactNode;
}) {
  const [forzada] = useState(subPorVistaVieja);
  const { sub, irA } = usePestanaInterna<SubControl>({
    moduleId: "loth-control",
    validas: SUBS_CONTROL,
    porDefecto: "trozas",
    forzada,
    pedido,
  });

  return (
    <PestanasDeVista prefijo="loth-control" etiqueta="Pestañas del Control del permiso" items={PESTANAS} activa={sub} onCambiar={irA}>
      {sub === "extraccion" ? extraccion : children(sub, irA)}
    </PestanasDeVista>
  );
}
