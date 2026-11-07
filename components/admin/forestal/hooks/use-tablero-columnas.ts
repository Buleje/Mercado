"use client";

/**
 * Qué columnas ve el usuario en el tablero de trozas, y por cuál ordena.
 *
 * Las columnas se recuerdan en localStorage (con try/catch: modo privado de
 * Safari, cuota llena o un JSON roto no pueden tumbar la vista). Lo guardado
 * pasa por `columnasValidas`, así una columna que se renombre o se quite no
 * deja la tabla vacía. El orden NO se recuerda: al volver, la vista arranca
 * con lo urgente arriba.
 */

import { useCallback, useEffect, useState } from "react";
import {
  COLUMNAS_POR_DEFECTO,
  columnasValidas,
  siguienteOrden,
  type ColumnaKey,
  type OrdenTablero,
} from "@/lib/forestal/loth-tablero-columnas";

const CLAVE = "loth-tablero-columnas-v1";

export function useTableroColumnas() {
  const [visibles, setVisibles] = useState<ColumnaKey[]>([...COLUMNAS_POR_DEFECTO]);
  const [orden, setOrden] = useState<OrdenTablero | null>(null);

  // Se lee DESPUÉS de montar: en el render del servidor no hay localStorage,
  // y leerlo en el estado inicial desalinearía la hidratación.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLAVE);
      if (raw) setVisibles(columnasValidas(JSON.parse(raw)));
    } catch (err) {
      console.warn("[loth-tablero] no se pudieron leer las columnas guardadas", err);
    }
  }, []);

  const guardar = useCallback((cols: ColumnaKey[]) => {
    const validas = columnasValidas(cols);
    setVisibles(validas);
    try {
      window.localStorage.setItem(CLAVE, JSON.stringify(validas));
    } catch (err) {
      console.warn("[loth-tablero] no se pudieron guardar las columnas", err);
    }
  }, []);

  const alternar = useCallback(
    (key: ColumnaKey) => {
      // La última columna no se apaga: una tabla sin columnas no se puede leer.
      if (visibles.includes(key) && visibles.length === 1) return;
      guardar(visibles.includes(key) ? visibles.filter((k) => k !== key) : [...visibles, key]);
    },
    [visibles, guardar],
  );

  const restablecer = useCallback(() => guardar([...COLUMNAS_POR_DEFECTO]), [guardar]);
  const ordenarPor = useCallback((key: ColumnaKey) => setOrden((o) => siguienteOrden(o, key)), []);

  return { visibles, alternar, restablecer, orden, ordenarPor };
}
