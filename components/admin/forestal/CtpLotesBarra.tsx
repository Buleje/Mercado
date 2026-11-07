"use client";

/**
 * La barra de la vista Lotes: buscador, «Filtros», «Opciones» y el orden.
 *
 * Compactación del libro (17-10): la lupa, Filtros y Opciones van al riel de
 * las vistas; en la página queda la fila que ordena las tarjetas (elegir
 * todas, con o sin madera y el orden) y el panel de filtros cuando se abre.
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
import { ArrowUpDown, SlidersHorizontal, X } from "@buleje/design-system/icons";
import { AccionesDeLaVista, TextoDeAccion } from "@/components/admin/shared/libro-acciones-vista";
import { cn } from "@/lib/utils";
import { BTN_FILTRO, CampoDeFiltro, usePanelFiltros } from "./ctp-filtros-panel";
import { CLASE_ENCENDIDO_RIEL, useBuscarEnRiel } from "./ctp-riel-piezas";
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
  conMadera,
  hayLotes,
  elegirTodos,
  menu,
}: {
  f: FiltrosLotes;
  facetas: Facetas;
  /** Algún lote trae el dato de su madera: sin él, el filtro rápido no filtraría nada. */
  conMadera: boolean;
  /** Sin lotes no hay nada que ordenar ni elegir: la fila de abajo no se pinta. */
  hayLotes: boolean;
  /** «Elegir los N visibles»: abre la fila que ordena las tarjetas. */
  elegirTodos: ReactNode;
  /** «Opciones» de la vista: va detrás de Filtros, como en las demás vistas. */
  menu: ReactNode;
}) {
  const { panelId, abierto, alternar } = usePanelFiltros(f.activos);
  const buscar = useBuscarEnRiel({
    id: "ctp-lotes-buscar",
    etiqueta: "Buscar un lote",
    placeholder: "Lote, especie, permiso, guía o pieza…",
    valor: f.texto,
    onCambiar: f.setTexto,
    claseFuera: "min-w-0 flex-1 sm:basis-48",
  });
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
      {/* Dentro del libro, lupa · Filtros · Opciones van al riel (17-10); fuera,
          en una fila propia como siempre. En el celular Filtros también lleva
          el orden, así que se ve aunque no haya filtros que mostrar. */}
      <AccionesDeLaVista>
        {buscar.boton}
        <button
          type="button"
          onClick={alternar}
          aria-expanded={abierto}
          aria-controls={panelId}
          title="Filtrar por especie, estado, cuánto queda y fecha de fin"
          className={cn(
            BTN_FILTRO,
            !hayFiltros && "sm:hidden",
            f.activos > 0 ? cn(CLASE_ENCENDIDO_RIEL, "@max-[80rem]/riel:px-3") : "@max-[80rem]/riel:w-12 @max-[80rem]/riel:px-0",
          )}
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden />
          <TextoDeAccion>Filtros</TextoDeAccion>
          {f.activos > 0 && (
            <span className="rounded-full bg-[var(--accent)] px-1.5 text-xs font-bold tabular-nums text-white">
              {f.activos}
            </span>
          )}
        </button>
        {menu}
      </AccionesDeLaVista>
      {buscar.campo}

      {/* Lo que ordena las tarjetas, pegado a ellas: elegir todas, con o sin
          madera (la pregunta del despacho) y el orden. */}
      {hayLotes && (
        <div className="flex flex-wrap items-center gap-2">
          {elegirTodos}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 max-sm:w-full">
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
        </div>
      )}

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
