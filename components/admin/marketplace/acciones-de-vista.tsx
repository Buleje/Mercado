"use client";

/**
 * Las acciones propias de una vista del Marketplace van al «⋯ Más» de la
 * cabecera del hub (una sola banda, un solo menú), no a un segundo «⋯» suelto
 * encima de la tabla. La vista las declara con `useAccionesDeVista`; el hub
 * las pone antes de «Actualizar».
 */

import { createContext, useContext, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import type { MenuAccion } from "@/components/admin/shared/action-menu";

type Registrar = Dispatch<SetStateAction<MenuAccion[]>>;

const AccionesDeVistaContext = createContext<Registrar | null>(null);

export const AccionesDeVistaProvider = AccionesDeVistaContext.Provider;

export function useAccionesDeVista(acciones: MenuAccion[]): void {
  const registrar = useContext(AccionesDeVistaContext);
  /* El `onSelect` lee siempre la versión de este render (el CSV, las órdenes
     filtradas de AHORA); se re-registra sólo si cambia lo que se ve. */
  const ultimas = useRef(acciones);
  ultimas.current = acciones;
  const firma = acciones.map((a) => `${a.id}|${a.label}|${a.hint ?? ""}|${a.disabled ? 1 : 0}`).join("§");
  useEffect(() => {
    if (!registrar) return;
    registrar(
      ultimas.current.map((a) => ({
        ...a,
        onSelect: () => ultimas.current.find((b) => b.id === a.id)?.onSelect(),
      })),
    );
    return () => registrar([]);
  }, [registrar, firma]);
}
