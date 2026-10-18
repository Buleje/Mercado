"use client";

/**
 * Libro TH › Control del permiso — Trozas · Kárdex · Extracción · Por árbol
 * (plan «panel unificado», F32, ola 2 — 2026-10-10; «Por árbol» entra al
 * compactar el libro, 17-10).
 *
 * «Extracción» (ADR-454) y «Por árbol» (antes la vista «trazabilidad») contestan
 * la misma pregunta que el Control —«¿cuánto le queda a este permiso?»—: son
 * pestañas del Control. Dos niveles (el riel y esta fila), nunca tres (regla R4).
 *
 * Cada pestaña monta lo de siempre: el tablero de trozas (con su pestaña
 * elegida desde acá), `LothExtraccionView` y la vista por árbol. Los de adentro
 * piden otra pestaña con `useIrASeccionControl()` (el saldo del Control enlaza
 * a la tabla por especie de Extracción).
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { Axe, History, LayoutGrid, TreePine } from "@buleje/design-system/icons";
import PestanasDeVista, { type PestanaDeVista } from "./PestanasDeVista";
import { usePestanaInterna } from "./hooks/use-pestana-interna";
import { SUBS_CONTROL, type SubControl } from "./loth-vistas-fusionadas";

export { SUBS_CONTROL, type SubControl };

const PESTANAS: readonly PestanaDeVista<SubControl>[] = [
  { id: "trozas", label: "Trozas", icon: LayoutGrid, hint: "Cada troza del permiso con su estado y su antigüedad en el patio" },
  { id: "kardex", label: "Kárdex", icon: History, hint: "Cada movimiento con su saldo" },
  { id: "extraccion", label: "Extracción", icon: Axe, hint: "Censo − tala, trozado y despacho por especie" },
  { id: "arbol", label: "Por árbol", icon: TreePine, hint: "La historia de cada árbol, del censo al aserradero" },
];

/** Un `?vista=extraccion` o `?vista=trazabilidad` viejo (o guardado) abre su pestaña. */
function subPorVistaVieja(): SubControl | undefined {
  if (typeof window === "undefined") return undefined;
  const vista = new URLSearchParams(window.location.search).get("vista");
  if (vista === "extraccion") return "extraccion";
  if (vista === "trazabilidad") return "arbol";
  return undefined;
}

const IrASeccionControl = createContext<((s: SubControl) => void) | null>(null);

/**
 * Pedir otra pestaña del Control desde adentro (null fuera de él: el que enlaza
 * no pinta el enlace).
 */
export function useIrASeccionControl(): ((s: SubControl) => void) | null {
  return useContext(IrASeccionControl);
}

export default function LothControlPestanas({
  extraccion,
  arbol,
  pedido,
  children,
}: {
  /** La vista Extracción (la arma el libro: necesita su señal de recarga y su navegación). */
  extraccion: ReactNode;
  /**
   * La vista «Por árbol» (la arma el libro: censo, cupo y navegación). Sin ella
   * la pestaña no aparece.
   */
  arbol?: ReactNode;
  pedido: { sub: string; n: number } | null;
  /**
   * El tablero de trozas, con la pestaña («trozas» o «kardex») que eligió esta
   * fila y cómo pedirle otra (el escáner salta de Kárdex a Trozas).
   */
  children: (pestana: "trozas" | "kardex", irAPestana: (p: "trozas" | "kardex") => void) => ReactNode;
}) {
  const conArbol = arbol !== undefined;
  const validas = useMemo(() => (conArbol ? SUBS_CONTROL : SUBS_CONTROL.filter((s) => s !== "arbol")), [conArbol]);
  const items = useMemo(() => (conArbol ? PESTANAS : PESTANAS.filter((p) => p.id !== "arbol")), [conArbol]);
  const [forzada] = useState(subPorVistaVieja);
  const { sub, irA } = usePestanaInterna<SubControl>({
    moduleId: "loth-control",
    validas,
    porDefecto: "trozas",
    forzada,
    pedido,
  });

  let contenido: ReactNode;
  if (sub === "extraccion") contenido = extraccion;
  else if (sub === "arbol" && conArbol) contenido = arbol;
  else contenido = children(sub === "kardex" ? "kardex" : "trozas", irA);

  return (
    <IrASeccionControl.Provider value={irA}>
      <PestanasDeVista prefijo="loth-control" etiqueta="Pestañas del Control del permiso" items={items} activa={sub} onCambiar={irA}>
        {contenido}
      </PestanasDeVista>
    </IrASeccionControl.Provider>
  );
}
