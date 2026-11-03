"use client";

/**
 * El mes que se mira en la Contabilidad (`YYYY-MM`). Se recuerda entre
 * secciones: pasar del Libro diario al Mayor no devuelve al mes actual.
 */
import { useCallback } from "react";
import { limaDateKey } from "@/lib/utils";
import { useLocalStorage } from "./use-local-storage";

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

export const mesActualLima = (): string => limaDateKey().slice(0, 7);

/** `mes` movido `delta` meses (puede ser negativo). */
export function moverMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const n = a * 12 + (m - 1) + delta;
  return `${Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`;
}

export function useMesContable() {
  const [guardado, setGuardado] = useLocalStorage<string>("plata-contabilidad-mes", mesActualLima());
  const mes = MES_VALIDO.test(guardado) ? guardado : mesActualLima();
  const setMes = useCallback((m: string) => { if (MES_VALIDO.test(m)) setGuardado(m); }, [setGuardado]);
  return { mes, setMes };
}
