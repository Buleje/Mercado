"use client";

import { useCallback, useMemo, useState } from "react";

type Valor = number | string | null | undefined;
export type AccesorOrden<T> = { valor: (fila: T) => Valor; /** Texto: de la A a la Z primero. Número o fecha: de mayor a menor primero. */ texto?: boolean };
export type Direccion = "asc" | "desc";
export type OrdenFijo = { id: string; direccion: Direccion };
export type OrdenColumna<T> = {
  /** Las filas en el orden elegido; sin orden elegido, tal cual llegan (el de siempre). */
  ordenar: (filas: readonly T[]) => T[];
  alternar: (id: string) => void;
  activa: string | null;
  direccion: Direccion;
  ariaSort: (id: string) => "ascending" | "descending" | "none";
};
/**
 * Modo controlado (opcional): el orden vive afuera —p. ej. porque una vista
 * guardada lo pone— y el hook sólo calcula y avisa. `valor: null` = sin orden.
 */
export type OrdenControlado = { valor: OrdenFijo | null; onCambio: (v: OrdenFijo | null) => void };

const vacio = (v: Valor) => v == null || v === "";

/** Orden estable de las filas por un accesor; lo vacío va al final en cualquier dirección. */
export function ordenarFilas<T>(filas: readonly T[], a: AccesorOrden<T> | undefined, direccion: Direccion): T[] {
  if (!a) return [...filas];
  return [...filas].sort((p, q) => {
    const x = a.valor(p);
    const y = a.valor(q);
    if (vacio(x)) return vacio(y) ? 0 : 1;
    if (vacio(y)) return -1;
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "es");
    return direccion === "asc" ? c : -c;
  });
}

/**
 * Orden por columna de las tablas del panel (nació en Lo que debo), como Adelantos › Lista. Primer
 * clic: texto de la A a la Z, números y fechas de mayor a menor; segundo, al
 * revés; tercero, vuelve al orden con que llegan las filas. Lo vacío va al final.
 * `accesores` tiene que ser estable (constante de módulo). Con `controlado`, el
 * estado es de afuera (ver `OrdenControlado`); sin él, es del hook.
 */
export function useOrdenColumna<T>(accesores: Record<string, AccesorOrden<T>>, controlado?: OrdenControlado): OrdenColumna<T> {
  const [propio, setPropio] = useState<OrdenFijo | null>(null);
  const orden = controlado ? controlado.valor : propio;
  const onCambio = controlado?.onCambio;

  const alternar = useCallback(
    (id: string) => {
      const primera: Direccion = accesores[id]?.texto ? "asc" : "desc";
      const siguiente: OrdenFijo | null =
        !orden || orden.id !== id ? { id, direccion: primera } : orden.direccion === primera ? { id, direccion: primera === "asc" ? "desc" : "asc" } : null;
      if (onCambio) onCambio(siguiente);
      else setPropio(siguiente);
    },
    [orden, accesores, onCambio],
  );

  const direccion: Direccion = orden?.direccion ?? "asc";

  const ordenar = useCallback(
    (filas: readonly T[]) => ordenarFilas(filas, orden ? accesores[orden.id] : undefined, direccion),
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
