"use client";

/**
 * La cola del monte a mano de la tabla GTF (16-10): se pide UNA vez por tabla
 * y cada fila lee su pastilla de acá (`porGuia`); el ⋯ «Enviar al monte» manda
 * por acá y la pastilla aparece sin recargar. Fuera del proveedor la pastilla
 * no dibuja nada y la ventana de envío usa su propio hook.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { trabajoDeLaFila } from "@/lib/forestal/gtf-cola-monte";
import type { TrabajoImpresion } from "@/lib/forestal/gtf-salida-tipos";
import { useColaMonte } from "./hooks/use-cola-monte";

type Cola = ReturnType<typeof useColaMonte>;

export interface ColaMonteCtx extends Pick<Cola, "datos" | "enviar" | "cambiar" | "recargar"> {
  /** El trabajo que muestra cada guía (por `gtfId`): el vivo o, si no, el último. */
  porGuia: Map<string, TrabajoImpresion>;
}

const Ctx = createContext<ColaMonteCtx | null>(null);

export function useColaMonteCtx(): ColaMonteCtx | null {
  return useContext(Ctx);
}

export function ColaMonteProvider({ children }: { children: ReactNode }) {
  const { datos, enviar, cambiar, recargar } = useColaMonte();
  const value = useMemo<ColaMonteCtx>(
    () => ({ datos, enviar, cambiar, recargar, porGuia: trabajoDeLaFila(datos?.trabajos ?? []) }),
    [datos, enviar, cambiar, recargar],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
