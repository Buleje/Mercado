"use client";

/**
 * Los «Papeles 3/4» de las GTF del Libro TH en pantalla (ADR-482), pedidos UNA
 * vez por página (`useConteoDocumentosGuias`) y dejados acá para que cada
 * fila dibuje su pastilla sin pedir nada. Fuera del proveedor la pastilla no
 * dibuja nada (las bajas, por ejemplo).
 *
 * `refrescar` lo llama el modal al subir o quitar un papel: la fila cambia sin
 * recargar la tabla.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useConteoDocumentosGuias } from "@/hooks/use-documentos-guia";
import type { CasilleroGuia } from "@/lib/forestal/documentos-guia";

export interface PapelesGuiasCtx {
  /** Papeles de ley que faltan por N° de guía; una guía sin medir no está. */
  faltan: Record<string, CasilleroGuia[]>;
  refrescar: () => void;
}

const Ctx = createContext<PapelesGuiasCtx | null>(null);

export function usePapelesGuias(): PapelesGuiasCtx | null {
  return useContext(Ctx);
}

/** Pide los papeles de estas guías y los deja a mano de las filas. */
export function PapelesGuiasProvider({
  gtfs,
  children,
}: {
  gtfs: readonly string[];
  children: ReactNode;
}) {
  const { faltan, refrescar } = useConteoDocumentosGuias(gtfs);
  const value = useMemo<PapelesGuiasCtx>(
    () => ({ faltan, refrescar: () => void refrescar() }),
    [faltan, refrescar],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
