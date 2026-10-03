"use client";

/**
 * La barra de la vista Lotes: indicadores, buscador, «Filtros» y el orden.
 *
 * Antes los cuatro desplegables (especie, estado, cuánto queda, fecha de fin)
 * iban sueltos en la barra: a 1280 partían la fila en dos y en el celular
 * ocupaban cuatro filas enteras antes de la primera tarjeta. Ahora van detrás
 * de «Filtros», como en Ingresos (27-09): a la vista quedan el buscador y el
 * orden, que es lo que se usa siempre. Un filtro puesto desde afuera (el
 * indicador «Lotes abiertos») abre el panel solo, para que se vea qué se
 * aplicó (`usePanelFiltros`).
 */

import type { ReactNode } from "react";
import { ArrowUpDown, Search, SlidersHorizontal, X } from "@buleje/design-system/icons";
import { BTN_FILTRO, CampoDeFiltro, usePanelFiltros } from "./ctp-filtros-panel";
import { ETIQUETA_ORDEN, type FacetaLotes, type OrdenLotes } from "@/lib/forestal/lotes-aserrio";
import type { FiltroMadera, FiltrosLotes } from "./hooks/use-filtros-lotes";
import SegmentedControl from "@/components/ui-system/SegmentedControl";

const CAMPO =
  "h-12 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

type Facetas = { especie: FacetaLotes[]; estado: FacetaLotes[]; sobra: FacetaLotes[]; situacion: FacetaLotes[] };

/* Filtro rápido (2026-10-02): a la vista, no detrás de «Filtros» — es la
   pregunta del despacho, «¿qué lotes tienen madera para sacar?». */
const OPCIONES_MADERA: { value: FiltroMadera; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "con", label: "Con madera" },
  { value: "sin", label: "Sin madera" },
];

function Orden({ f, className }: { f: FiltrosLotes; className: string }) {
  return (
    <label className={`items-center gap-1.5 text-sm text-[var(--text-secondary)] ${className}`}>
      <ArrowUpDown className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
      <span className="sr-only">Ordenar</span>
      <select
        value={f.orden}
        onChange={(e) => f.setOrden(e.target.value as OrdenLotes)}
        aria-label="Ordenar los lotes"
        className={`${CAMPO} min-w-0 flex-1 px-2`}
      >
        {(Object.keys(ETIQUETA_ORDEN) as OrdenLotes[]).map((o) => (
          <option key={o} value={o}>
            {ETIQUETA_ORDEN[o]}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Un campo del panel, con su rótulo arriba (el mismo aspecto que `CtpFiltrosPanel`). */
function Campo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-bold text-[var(--text-primary)]">{titulo}</span>
      {children}
    </div>
  );
}

export default function CtpLotesBarra({
  f,
  facetas,
  kpiBoton,
  conMadera,
}: {
  f: FiltrosLotes;
  facetas: Facetas;
  /** El botón «Indicadores» (Brandon, 2026-09-24: alineado con los demás botones). */
  kpiBoton: ReactNode;
  /** Algún lote trae el dato de su madera: sin él, el filtro rápido no filtraría nada. */
  conMadera: boolean;
}) {
  const { panelId, abierto, alternar } = usePanelFiltros(f.activos);
  /* Un filtro con una sola opción no se dibuja: ocupaba lugar sin filtrar nada
     (los 5 lotes del tenant eran todos Tornillo). */
  const ejes = [
    { id: "especie", titulo: "Especie", vacio: "Todas las especies", opciones: facetas.especie, value: f.especie, set: f.setEspecie, textoVacio: "Sin especies" },
    { id: "estado", titulo: "Estado del lote", vacio: "Todos los estados", opciones: facetas.estado, value: f.estado, set: f.setEstado, textoVacio: "Sin lotes" },
    { id: "sobra", titulo: "Cuánto queda", vacio: "Quede lo que quede", opciones: facetas.sobra, value: f.sobra, set: f.setSobra, textoVacio: "Sin lotes" },
    { id: "situacion", titulo: "Fecha de fin", vacio: "Cualquier fecha", opciones: facetas.situacion, value: f.situacion, set: f.setSituacion, textoVacio: "Sin lotes" },
  ].filter((e) => e.opciones.length > 1);
  const hayFiltros = ejes.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 max-sm:w-full sm:basis-72">{kpiBoton}</div>
        <label className="relative min-w-0 flex-1 sm:basis-48">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
            aria-hidden
          />
          <input
            value={f.texto}
            onChange={(e) => f.setTexto(e.target.value)}
            placeholder="Lote, especie, permiso, guía o pieza…"
            aria-label="Buscar un lote"
            className={`${CAMPO} w-full pl-9 ${f.texto ? "pr-10" : "pr-3"}`}
          />
          {f.texto && (
            <button
              type="button"
              onClick={() => f.setTexto("")}
              aria-label="Borrar la búsqueda"
              className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
        {/* En el celular también lleva el orden: sin filtros que mostrar el
            botón sigue ahí, pero sólo en el celular. */}
        <button
          type="button"
          onClick={alternar}
          aria-expanded={abierto}
          aria-controls={panelId}
          title="Filtrar por especie, estado, cuánto queda y fecha de fin"
          className={`${BTN_FILTRO} ${hayFiltros ? "" : "sm:hidden"} ${
            f.activos > 0
              ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] max-sm:w-auto max-sm:px-3 dark:text-[var(--accent)]"
              : ""
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          <span className="max-sm:sr-only">Filtros</span>
          {f.activos > 0 && (
            <span className="rounded-full bg-[var(--accent)] px-1.5 text-xs font-bold tabular-nums text-white">
              {f.activos}
            </span>
          )}
        </button>
        {conMadera && (
          <SegmentedControl
            value={f.madera}
            onChange={f.setMadera}
            options={OPCIONES_MADERA}
            size="lg"
            label="Lotes con o sin madera aserrada en patio"
            className="max-sm:w-full max-sm:justify-between"
          />
        )}
        <Orden f={f} className="hidden sm:flex" />
      </div>

      {/* Sin filtros con más de una opción y sin nada activo, el panel no
          tiene nada que mostrar: quedaba una caja vacía, sin ejes y sin el
          botón «Limpiar», que no se podía cerrar más que volviendo a tocar el
          indicador. */}
      {abierto && (hayFiltros || f.activos > 0) && (
        <div
          id={panelId}
          className="grid gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {ejes.map((e) => (
            <Campo key={e.id} titulo={e.titulo}>
              <CampoDeFiltro
                label={e.titulo.toLowerCase()}
                placeholder={e.vacio}
                value={e.value}
                options={e.opciones}
                onChange={e.set}
                textoVacio={e.textoVacio}
              />
            </Campo>
          ))}
          <div className="sm:hidden">
            <Campo titulo="Ordenar">
              <Orden f={f} className="flex" />
            </Campo>
          </div>
          {f.activos > 0 && (
            <button
              type="button"
              onClick={f.limpiar}
              className="inline-flex h-12 items-center gap-1.5 self-end justify-self-start rounded-2xl px-3 text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" aria-hidden /> Limpiar los filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}
