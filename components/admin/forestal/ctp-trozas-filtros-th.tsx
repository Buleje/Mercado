"use client";

/**
 * Cabecera de columna de la tabla del patio: el título ORDENA (clic, asc/desc,
 * `aria-sort`) y debajo va su autofiltro. `ThOrdenable` no sirve acá porque
 * mete todo en un `<button>` y un filtro dentro de un botón no es válido.
 */

import { ArrowDown, ArrowUp, ArrowUpDown } from "@buleje/design-system/icons";
import {
  FiltroColumnaMulti,
  FiltroColumnaRango,
  type Rango,
} from "@/components/admin/shared/filtros-columna";
import type { CampoOrdenTroza, IdColumnaTroza, OrdenColumnaTroza } from "./ctp-trozas-filtros-columnas";
import type { FiltrosTrozas } from "./ctp-trozas-filtros-hook";

export function ThTroza({
  campo, orden, onOrdenar, align = "left", col, title, className = "", children, filtro,
}: {
  campo: CampoOrdenTroza;
  orden: OrdenColumnaTroza;
  onOrdenar: (c: CampoOrdenTroza) => void;
  align?: "left" | "right";
  /** El id que arrastra `useOrdenColumnas` (la tabla del patio; el modal no). */
  col?: string;
  title?: string;
  className?: string;
  children: React.ReactNode;
  filtro?: React.ReactNode;
}) {
  const activo = orden.by === campo;
  const Icono = !activo ? ArrowUpDown : orden.dir === "asc" ? ArrowUp : ArrowDown;
  const der = align === "right";
  return (
    <th
      data-col={col}
      title={title}
      aria-sort={activo ? (orden.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`align-top ${der ? "text-right" : ""} ${className}`}
    >
      <button
        type="button"
        onClick={() => onOrdenar(campo)}
        title={`Ordenar por ${String(children)}`}
        className={`inline-flex items-center gap-1 rounded px-0.5 font-[inherit] transition-colors hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)] ${
          der ? "flex-row-reverse" : ""
        } ${activo ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""}`}
      >
        {children}
        <Icono className={`h-3.5 w-3.5 shrink-0 ${activo ? "" : "opacity-40"}`} aria-hidden="true" />
      </button>
      {filtro && <div className={der ? "flex justify-end" : undefined}>{filtro}</div>}
    </th>
  );
}

/** El control de una columna de rango (min/max). */
export function FiltroRangoTroza({
  id, label, unidad, paso, f,
}: {
  id: IdColumnaTroza;
  label: string;
  unidad: string;
  paso: number;
  f: FiltrosTrozas;
}) {
  return (
    <FiltroColumnaRango
      label={label}
      unidad={unidad}
      paso={paso}
      valor={f.facetas[id] as Rango<number> | undefined}
      onChange={(r) => f.setFaceta(id, r as Rango<number>)}
      placeholder="Todos"
    />
  );
}

/** El control de una columna de casillas. */
export function FiltroMultiTroza({
  id, label, f, etiqueta, placeholder = "Todos",
}: {
  id: IdColumnaTroza;
  label: string;
  f: FiltrosTrozas;
  etiqueta?: (v: string) => string;
  placeholder?: string;
}) {
  return (
    <FiltroColumnaMulti
      label={label}
      value={f.facetas[id] as string[] | undefined}
      options={f.opciones[id] ?? []}
      etiqueta={etiqueta}
      onChange={(v) => f.setFaceta(id, v)}
      placeholder={placeholder}
    />
  );
}
