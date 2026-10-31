"use client";

/**
 * El estado de las correcciones de la lista, para que cada fila (su menú ⋯ y
 * su chip) lo lea sin pasar props por la tabla. Lo provee la lista que hizo la
 * única llamada (`useCorreccionesDeGuias`); fuera de un proveedor vale null y
 * la fila no ofrece «Pedir corrección».
 */

import { createContext, useContext } from "react";
import type { CorreccionesDeGuias } from "../hooks/use-correcciones-de-guias";

const Ctx = createContext<CorreccionesDeGuias | null>(null);

export const CorreccionesGuiasProvider = Ctx.Provider;

export function useCorreccionesCtx(): CorreccionesDeGuias | null {
  return useContext(Ctx);
}
