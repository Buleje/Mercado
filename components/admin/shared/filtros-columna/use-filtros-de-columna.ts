"use client";

/**
 * useFiltrosDeColumna — el estado único de los autofiltros de una tabla.
 *
 * La cabecera y el panel («Filtros», o el que aparece cuando una columna con
 * filtro puesto se oculta) escriben ACÁ, nunca cada uno el suyo — dos
 * controles del mismo estado enseñan a dudar de cuál manda (Brandon,
 * 2026-09-03). Este hook es el único lugar con `useState`; todo lo demás
 * (facetas, filtrado, chips) sale de `lib/admin/filtros-columna.ts`, puro y
 * testeado sin React.
 */

import { useCallback, useMemo, useState } from "react";
import {
  aplicarFacetas,
  columnaTieneAutofiltro,
  contarFacetas,
  facetasPuestas,
  opcionesDeColumna,
  type ChipFiltro,
  type ColumnaFiltro,
  type FacetaOpcion,
  type FacetasEstado,
  type ValorFaceta,
} from "@/lib/admin/filtros-columna";

export interface UseFiltrosDeColumnaResult<T> {
  /** El estado único: una entrada por columna con algo puesto. */
  facetas: FacetasEstado;
  /** Las opciones de cada columna texto/multi, con su peso — de TODA la pila
   *  (no de lo ya filtrado por las demás columnas), igual que el autofiltro
   *  de Excel: elegir una faceta no debe esconder las otras opciones. */
  opciones: Record<string, FacetaOpcion[]>;
  /** Las filas que pasan TODAS las facetas activas. */
  filtradas: T[];
  setFaceta: (id: string, valor: ValorFaceta | undefined) => void;
  limpiar: () => void;
  /** Cuántas columnas están acotando — el badge del botón «Filtros». */
  activos: number;
  /** Los filtros puestos, listos para `<ChipsDeFiltros>`. */
  chips: ChipFiltro[];
  /** `true` = esta columna monta su control en el `<th>`. `false` = la
   *  columna está oculta (`visible: false`) y su filtro, si tiene algo
   *  puesto, tiene que seguir apareciendo en el panel — nunca huérfano. */
  enCabecera: Record<string, boolean>;
  /** `true` = la columna debe dibujar el autofiltro ahora (respeta `soloConVarios`). */
  conAutofiltro: Record<string, boolean>;
}

export function useFiltrosDeColumna<T>(
  filas: readonly T[],
  columnas: readonly ColumnaFiltro<T>[],
): UseFiltrosDeColumnaResult<T> {
  const [facetas, setFacetas] = useState<FacetasEstado>({});

  const opciones = useMemo(() => {
    const out: Record<string, FacetaOpcion[]> = {};
    for (const c of columnas) {
      if (c.tipo === "texto" || c.tipo === "multi") out[c.id] = opcionesDeColumna(filas, c);
    }
    return out;
  }, [filas, columnas]);

  const conAutofiltro = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const c of columnas) out[c.id] = columnaTieneAutofiltro(filas, c);
    return out;
  }, [filas, columnas]);

  const filtradas = useMemo(() => aplicarFacetas(filas, columnas, facetas), [filas, columnas, facetas]);

  const setFaceta = useCallback((id: string, valor: ValorFaceta | undefined) => {
    setFacetas((prev) => {
      const vacio = valor === undefined || (Array.isArray(valor) && valor.length === 0);
      if (vacio) {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: valor };
    });
  }, []);

  const limpiar = useCallback(() => setFacetas({}), []);

  const activos = useMemo(() => contarFacetas(facetas), [facetas]);
  const chips = useMemo(() => facetasPuestas(columnas, facetas), [columnas, facetas]);
  const enCabecera = useMemo(
    () => Object.fromEntries(columnas.map((c) => [c.id, c.visible !== false])),
    [columnas],
  );

  return { facetas, opciones, filtradas, setFaceta, limpiar, activos, chips, enCabecera, conAutofiltro };
}
