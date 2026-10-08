"use client";

/**
 * Las columnas de la tabla de una sección del Libro TH: cuáles se ven y en qué
 * orden, recordado POR SECCIÓN en este navegador (backlog L11, 08-10: «al nivel
 * de las tablas del Libro CTP»). Reúsa `columnas-ordenables` tal cual: el mismo
 * arrastre de títulos (o Alt+←/→) y el mismo menú «Columnas n/m» que la tabla
 * GTF de este libro y el patio del CTP.
 *
 * Fijas: la casilla (primera) y «Acciones» (última). Se mueven y se ocultan:
 * N°, Fecha, las de la sección y Observaciones.
 *
 * Por qué un proveedor con `key={section}`: `useLocalStorage` lee su clave al
 * MONTAR. Sin volver a montar, Trozado heredaba el orden de Tala y lo guardaba
 * bajo su propia clave al primer arrastre. El botón (en la barra) y la tabla
 * leen el mismo estado del contexto; fuera del proveedor la tabla pinta el
 * orden de fábrica y el botón no aparece.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  BotonColumnasVisibles,
  BotonRestablecerColumnas,
  useOrdenColumnas,
  useVisibilidadColumnas,
  type ColumnaElegible,
  type UseOrdenColumnasResult,
  type UseVisibilidadColumnasResult,
} from "@/components/admin/shared/columnas-ordenables";
import type { LothSection } from "@/lib/forestal/loth-constants";
import { etiquetaDeFiltro } from "./loth-seccion-filtros";

interface ColumnaDeSeccion {
  key: string;
  label: string;
}

/**
 * Las columnas movibles en su orden de fábrica. «permiso» va SIEMPRE detrás de
 * la primera —donde la pone `conColumnaPermiso`—, aparezca hoy o no: así el
 * orden guardado no cambia cuando la sección pasa a mezclar planes.
 */
export function ordenDeFabrica(cols: readonly { key: string }[]): string[] {
  const propias = cols.map((c) => c.key).filter((k) => k !== "permiso");
  return ["lineNo", "fecha", ...propias.slice(0, 1), "permiso", ...propias.slice(1), "obs"];
}

/** Lo que lista el menú «Columnas», en el orden de la tabla. */
export function columnasElegibles(cols: readonly ColumnaDeSeccion[]): ColumnaElegible[] {
  return [
    { id: "lineNo", label: "N°" },
    { id: "fecha", label: "Fecha" },
    // «ci» (consumo interno) no tiene título en la tabla: en el menú se llama como su filtro.
    ...cols.map((c) => ({ id: c.key, label: c.label || etiquetaDeFiltro(c.key) || c.key })),
    { id: "obs", label: "Observaciones" },
  ];
}

interface ColumnasSeccion {
  orden: UseOrdenColumnasResult;
  vis: UseVisibilidadColumnasResult;
}

const ColumnasCtx = createContext<ColumnasSeccion | null>(null);

function Proveedor({ section, cols, children }: { section: LothSection; cols: readonly ColumnaDeSeccion[]; children: ReactNode }) {
  const clave = `loth-seccion-${section}`;
  const porDefecto = useMemo(() => ordenDeFabrica(cols), [cols]);
  const elegibles = useMemo(() => columnasElegibles(cols), [cols]);
  const orden = useOrdenColumnas(clave, porDefecto);
  const vis = useVisibilidadColumnas(clave, elegibles);
  return <ColumnasCtx.Provider value={{ orden, vis }}>{children}</ColumnasCtx.Provider>;
}

/** Envuelve la barra y la tabla de la sección. Se monta de nuevo al cambiar de sección (ver arriba). */
export function LothSeccionColumnas(props: { section: LothSection; cols: readonly ColumnaDeSeccion[]; children: ReactNode }) {
  return <Proveedor key={props.section} {...props} />;
}

/** El orden a pintar (sólo las visibles) y la ref del `<thead>` que escucha el arrastre. */
export function useOrdenSeccion(cols: readonly { key: string }[]): {
  orden: string[];
  refCabecera?: (el: HTMLTableSectionElement | null) => void;
} {
  const ctx = useContext(ColumnasCtx);
  const deFabrica = useMemo(() => ordenDeFabrica(cols), [cols]);
  if (!ctx) return { orden: deFabrica };
  return { orden: ctx.vis.filtrar(ctx.orden.orden), refCabecera: ctx.orden.refCabecera };
}

/** «Columnas n/m» y, si se movió alguna, «Restablecer» — para la barra de la sección. */
export function BotonesColumnasSeccion() {
  const ctx = useContext(ColumnasCtx);
  if (!ctx) return null;
  return (
    <>
      <BotonRestablecerColumnas cambiado={ctx.orden.cambiado} onRestablecer={ctx.orden.restablecer} soloIcono />
      <BotonColumnasVisibles vis={ctx.vis} className="h-12 rounded-2xl" />
    </>
  );
}
