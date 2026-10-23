"use client";

/**
 * Notas del día SIN marca (23-10) para toda la hoja (día, semana, mes) sin
 * pasar props por cada tabla: la fila del día y cada casilla leen de acá la
 * nota suelta de su persona y día. La nota no toca los conteos.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { claveNota } from "@/lib/rrhh/nota-del-dia";
import type { GuardarNota } from "@/hooks/use-nota-asistencia";
import type { FechaKey, NotaAsistenciaDTO } from "@/lib/rrhh/tipos";

interface NotasDelDia {
  sueltaDe: (colaboradorId: string, fecha: FechaKey) => NotaAsistenciaDTO | undefined;
  /** Ausente = la hoja sólo muestra (sin acción «Nota»). */
  guardarNota?: GuardarNota;
}

const NotasCtx = createContext<NotasDelDia>({ sueltaDe: () => undefined });

export function NotasDelDiaProvider({ notas, guardarNota, children }: { notas: NotaAsistenciaDTO[] | undefined; guardarNota?: GuardarNota; children: ReactNode }) {
  const valor = useMemo<NotasDelDia>(() => {
    const porClave = new Map((notas ?? []).map((n) => [claveNota(n.colaboradorId, n.fecha), n]));
    return { sueltaDe: (colaboradorId, fecha) => porClave.get(claveNota(colaboradorId, fecha)), guardarNota };
  }, [notas, guardarNota]);
  return <NotasCtx.Provider value={valor}>{children}</NotasCtx.Provider>;
}

export function useNotasDelDia(): NotasDelDia {
  return useContext(NotasCtx);
}
