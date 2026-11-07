"use client";

import { useEffect, useMemo } from "react";

/**
 * Adaptadores para las tablas del Marketplace (Órdenes, Productos) que ya traen su
 * propio orden y su selección en el hook de la vista, y reciben encima los filtros
 * de columna del encabezado.
 */

/** El orden de la vista con la forma que pide `ThColumna`. */
export function useOrdenDeVista<K extends string>(sortKey: K, sortDir: "asc" | "desc", ordenarPor: (k: K) => void) {
  return useMemo(
    () => ({
      alternar: (id: string) => ordenarPor(id as K),
      activa: sortKey as string | null,
      direccion: sortDir,
      ariaSort: (id: string): "ascending" | "descending" | "none" => (sortKey !== id ? "none" : sortDir === "asc" ? "ascending" : "descending"),
    }),
    // ordenarPor se recrea en cada render; sólo cuentan la clave y la dirección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sortKey, sortDir],
  );
}

/**
 * Con filtros de columna puestos, la selección (y los botones en lote) sólo actúa
 * sobre lo que se ve: lo elegido que el filtro esconde se suelta.
 */
export function useSoltarSeleccionOculta(
  hayFiltros: boolean,
  visibles: readonly { id: string }[],
  seleccion: ReadonlySet<string>,
  setSeleccion: (s: Set<string>) => void,
) {
  useEffect(() => {
    if (!hayFiltros) return;
    const ids = new Set(visibles.map((x) => x.id));
    const quedan = Array.from(seleccion).filter((id) => ids.has(id));
    if (quedan.length !== seleccion.size) setSeleccion(new Set(quedan));
  }, [hayFiltros, visibles, seleccion, setSeleccion]);
}
