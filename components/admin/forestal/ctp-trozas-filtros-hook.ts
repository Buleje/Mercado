"use client";

/**
 * Los filtros de columna de la tabla del patio: UN estado (`useFiltrosDeColumna`)
 * más el buscador «contiene» de Código, que no es una faceta de casillas.
 *
 * La cabecera de la tabla, el panel del teléfono y los chips con cruz leen y
 * escriben ESTE estado — nunca cada uno el suyo.
 *
 * `ids` tiene que ser una constante de módulo: cambia el catálogo si cambia.
 */

import { useCallback, useMemo, useState } from "react";
import {
  useFiltrosDeColumna,
  type ChipFiltro,
  type FacetaOpcion,
  type FacetasEstado,
  type ValorFaceta,
} from "@/components/admin/shared/filtros-columna";
import { coincideCodigo, columnasTrozas, type IdColumnaTroza } from "./ctp-trozas-filtros-columnas";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

export interface FiltrosTrozas {
  codigo: string;
  setCodigo: (v: string) => void;
  facetas: FacetasEstado;
  setFaceta: (id: string, v: ValorFaceta | undefined) => void;
  opciones: Record<string, FacetaOpcion[]>;
  /** Lo que pasa estos filtros (el orden de `filas` se conserva). */
  filtradas: TrozaPatioAPI[];
  chips: ChipFiltro[];
  quitar: (id: string) => void;
  limpiar: () => void;
  activos: number;
}

export function useFiltrosTrozas(
  filas: readonly TrozaPatioAPI[],
  hoy: Date,
  ids: readonly IdColumnaTroza[],
): FiltrosTrozas {
  const columnas = useMemo(() => columnasTrozas(hoy).filter((c) => ids.includes(c.id as IdColumnaTroza)), [hoy, ids]);
  const base = useFiltrosDeColumna(filas, columnas);
  const [codigo, setCodigoState] = useState("");
  const setCodigo = useCallback((v: string) => setCodigoState(v.trim()), []);

  const filtradas = useMemo(
    () => (codigo ? base.filtradas.filter((t) => coincideCodigo(t, codigo)) : base.filtradas),
    [base.filtradas, codigo],
  );
  const chips = useMemo(() => {
    /* «Guía: X» y no «X» a secas: un chip suelto no dice de qué columna es. */
    const de = base.chips.map((c) =>
      columnas.find((k) => k.id === c.id)?.tipo === "multi" && !c.texto.includes(":")
        ? { ...c, texto: `${c.label}: ${c.texto}` }
        : c,
    );
    return codigo ? [{ id: "codigo", label: "Código", texto: `Código: «${codigo}»` }, ...de] : de;
  }, [base.chips, columnas, codigo]);

  const { setFaceta, limpiar: limpiarBase } = base;
  const quitar = useCallback(
    (id: string) => (id === "codigo" ? setCodigoState("") : setFaceta(id, undefined)),
    [setFaceta],
  );
  const limpiar = useCallback(() => {
    limpiarBase();
    setCodigoState("");
  }, [limpiarBase]);

  return {
    codigo, setCodigo, facetas: base.facetas, setFaceta, opciones: base.opciones,
    filtradas, chips, quitar, limpiar, activos: base.activos + (codigo ? 1 : 0),
  };
}
