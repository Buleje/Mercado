"use client";

import { useCallback, useMemo, useState } from "react";

type Valor = number | string | null | undefined;
export type AccesorOrden<T> = { valor: (fila: T) => Valor; /** Texto: de la A a la Z primero. Número o fecha: de mayor a menor primero. */ texto?: boolean };
export type Direccion = "asc" | "desc";
export type OrdenColumna<T> = {
  /** Las filas en el orden elegido; sin orden elegido, tal cual llegan (el de siempre). */
  ordenar: (filas: readonly T[]) => T[];
  alternar: (id: string) => void;
  activa: string | null;
  direccion: Direccion;
  ariaSort: (id: string) => "ascending" | "descending" | "none";
};

/**
 * Orden por columna de las tablas del panel (nació en Lo que debo), como Adelantos › Lista. Primer
 * clic: texto de la A a la Z, números y fechas de mayor a menor; segundo, al
 * revés; tercero, vuelve al orden con que llegan las filas. Lo vacío va al final.
 * `accesores` tiene que ser estable (constante de módulo).
 */
export function useOrdenColumna<T>(accesores: Record<string, AccesorOrden<T>>): OrdenColumna<T> {
  const [orden, setOrden] = useState<{ id: string; paso: 1 | 2 } | null>(null);

  const alternar = useCallback((id: string) => {
    setOrden((o) => (!o || o.id !== id ? { id, paso: 1 } : o.paso === 1 ? { id, paso: 2 } : null));
  }, []);

  const direccion: Direccion = !orden ? "asc" : (accesores[orden.id]?.texto ? orden.paso === 1 : orden.paso === 2) ? "asc" : "desc";

  const ordenar = useCallback(
    (filas: readonly T[]) => {
      const a = orden ? accesores[orden.id] : undefined;
      if (!a) return [...filas];
      const vacio = (v: Valor) => v == null || v === "";
      return [...filas].sort((p, q) => {
        const x = a.valor(p);
        const y = a.valor(q);
        if (vacio(x)) return vacio(y) ? 0 : 1;
        if (vacio(y)) return -1;
        const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es");
        return direccion === "asc" ? c : -c;
      });
    },
    [orden, accesores, direccion],
  );

  const ariaSort = useCallback(
    (id: string): "ascending" | "descending" | "none" => (!orden || orden.id !== id ? "none" : direccion === "asc" ? "ascending" : "descending"),
    [orden, direccion],
  );

  return useMemo(
    () => ({ ordenar, alternar, activa: orden?.id ?? null, direccion, ariaSort }),
    [ordenar, alternar, orden, direccion, ariaSort],
  );
}
