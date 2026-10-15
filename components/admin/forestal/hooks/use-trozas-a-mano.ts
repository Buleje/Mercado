"use client";

/**
 * useTrozasAMano — las filas que se anotan a mano en «Despachar con guía»
 * (15-10): D1, D2, largo y cantidad. Sólo guarda las filas; numerarlas y
 * cubicarlas es de `piezasAMano` (la misma función que corre el servidor).
 */

import { useCallback, useRef, useState } from "react";
import type { TrozaAMano } from "@/lib/forestal/loth-trozas-a-mano";

/** Una fila anotada, con una clave estable para la lista (quitar una no renumera las keys). */
export interface FilaAMano extends TrozaAMano {
  key: number;
}

export function useTrozasAMano() {
  const [filas, setFilas] = useState<FilaAMano[]>([]);
  const siguiente = useRef(0);
  const agregar = useCallback((t: TrozaAMano) => {
    siguiente.current += 1;
    const key = siguiente.current;
    setFilas((prev) => [...prev, { ...t, key }]);
  }, []);
  const quitar = useCallback((key: number) => setFilas((prev) => prev.filter((f) => f.key !== key)), []);
  return { filas, agregar, quitar };
}

export type TrozasAMano = ReturnType<typeof useTrozasAMano>;
