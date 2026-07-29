"use client";

/**
 * CtpRadarControles — la barra del dibujo de la cadena.
 *
 * Buscar dentro del grafo, recorrer los eslabones sin cerrar de a uno, ordenar
 * las columnas, escalar el dibujo y agrupar/desagrupar. Son los mandos del
 * lienzo: viven aparte para que el componente del Radar se ocupe del grafo y no
 * de seis grupos de botones.
 *
 * Extraído de CtpTrazaRadar sin cambiar comportamiento.
 */

import { ArrowDownUp, Layers, Locate, Maximize2, Search, X as XIcon, ZoomIn, ZoomOut } from "@buleje/design-system/icons";
import type { RadarOrden } from "@/lib/forestal/ctp-radar";
import { ORDENES, ZOOM_MAX, ZOOM_MIN, type Foco } from "./ctp-radar-tipos";

export interface CtpRadarControlesProps {
  query: string;
  onQuery: (v: string) => void;
  /** Cuántos nodos matchea la búsqueda (para decir "3 coincidencias"). */
  matchIds: ReadonlySet<string> | null;
  /** Nodos con un eslabón sin cerrar, EN ORDEN — el recorrido va por estos. */
  idsConProblema: readonly string[];
  orden: RadarOrden;
  onOrden: (o: RadarOrden) => void;
  zoom: number;
  /** Acepta el valor o el updater: el botón "restablecer" manda 1. */
  onZoom: (v: number | ((z: number) => number)) => void;
  onAjustarAlAncho: () => void;
  /** Recorre los eslabones sin cerrar: fija el siguiente y lo trae a la vista. */
  onSiguienteHueco: () => void;
  totalHuecos: number;
  huecoIdx: number;
  agruparManual: boolean | null;
  onAgruparManual: (fn: (v: boolean | null) => boolean | null) => void;
  hayAgrupacion: boolean;
  expandidos: ReadonlySet<string>;
  onExpandidos: (s: ReadonlySet<string>) => void;
  foco: Foco;
  onFoco: (f: Foco) => void;
}

export default function CtpRadarControles({
  query,
  onQuery: setQuery,
  matchIds,
  idsConProblema,
  orden,
  onOrden: setOrden,
  zoom,
  onZoom: setZoom,
  onAjustarAlAncho: ajustarAlAncho,
  onSiguienteHueco: irAlSiguienteHueco,
  totalHuecos,
  huecoIdx,
  agruparManual,
  onAgruparManual: setAgruparManual,
  hayAgrupacion,
  expandidos,
  onExpandidos: setExpandidos,
  foco,
  onFoco: setFoco,
}: CtpRadarControlesProps) {
  return (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[15rem] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar GTF, especie, destino o «corrida 2»…"
                  aria-label="Buscar en la cadena de custodia"
                  className="h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-9 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] focus:outline-none"
                />
                {query && (
                  <button type="button" onClick={() => setQuery("")} title="Limpiar búsqueda" className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]">
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {matchIds && (
                <span className="shrink-0 text-xs font-bold text-[var(--text-secondary)]">
                  {matchIds.size} {matchIds.size === 1 ? "coincidencia" : "coincidencias"}
                </span>
              )}

              {/* Recorrer los eslabones sin cerrar de a uno: los fija y trae la
                  vista hasta ellos. Buscarlos a ojo en una cadena larga es el
                  trabajo lento del cierre de mes. */}
              {idsConProblema.length > 0 && (
                <button
                  type="button"
                  onClick={irAlSiguienteHueco}
                  title="Fijar el siguiente eslabón sin cerrar y traer la vista hasta él"
                  className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 text-xs font-bold text-[var(--data-warning-700)] transition hover:brightness-105 dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]"
                >
                  <Locate className="h-3.5 w-3.5" />
                  Ir al hueco
                  <span className="font-mono tabular-nums">
                    {(huecoIdx % idsConProblema.length) + 1}/{idsConProblema.length}
                  </span>
                </button>
              )}

              {/* Orden de las columnas: por línea del libro, por urgencia o por tamaño. */}
              <div className="inline-flex h-10 shrink-0 items-center overflow-hidden rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
                <span className="flex h-full items-center gap-1.5 border-r-2 border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-tertiary)]">
                  <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" /> Orden
                </span>
                {ORDENES.map((o) => (
                  <button
                    key={o.key} type="button" title={o.hint} onClick={() => setOrden(o.key)} aria-pressed={orden === o.key}
                    className={`h-full px-2.5 text-xs font-bold transition ${orden === o.key ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"}`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>

              {/* Zoom: con muchas líneas la cadena no entra; achicar la deja de un vistazo. */}
              <div className="inline-flex h-10 shrink-0 items-center overflow-hidden rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
                <button type="button" title="Alejar" aria-label="Alejar" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, Number((z - 0.15).toFixed(2))))} disabled={zoom <= ZOOM_MIN} className="flex h-full w-9 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40">
                  <ZoomOut className="h-4 w-4" />
                </button>
                <button type="button" title="Restablecer el tamaño" onClick={() => setZoom(1)} className="h-full border-x-2 border-[var(--rule-base)] px-2 font-mono text-xs font-bold tabular-nums text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
                  {Math.round(zoom * 100)}%
                </button>
                <button type="button" title="Ajustar: que la cadena entre entera en la pantalla" aria-label="Ajustar al ancho" onClick={ajustarAlAncho} className="flex h-full w-9 items-center justify-center border-r-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]">
                  <Maximize2 className="h-4 w-4" />
                </button>
                <button type="button" title="Acercar" aria-label="Acercar" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, Number((z + 0.15).toFixed(2))))} disabled={zoom >= ZOOM_MAX} className="flex h-full w-9 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] disabled:opacity-40">
                  <ZoomIn className="h-4 w-4" />
                </button>
              </div>

              {/* Agrupar: con muchas líneas el grafo no entra en pantalla. Se
                  activa solo, pero se puede forzar o desarmar a mano. */}
              <button
                type="button"
                onClick={() => setAgruparManual((v) => (v === null ? !hayAgrupacion : !v))}
                aria-pressed={hayAgrupacion}
                title={hayAgrupacion ? "Ver línea por línea" : "Agrupar por especie, producto y destino"}
                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border-2 px-3 text-sm font-bold transition ${
                  hayAgrupacion
                    ? "border-[var(--accent)] bg-primary/10 dark:bg-[var(--accent)]/12 text-[var(--accent)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
                }`}
              >
                <Layers className="h-4 w-4" /> {hayAgrupacion ? "Agrupado" : "Agrupar"}
              </button>
              {hayAgrupacion && expandidos.size > 0 && (
                <button type="button" onClick={() => setExpandidos(new Set())} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]">
                  Cerrar los {expandidos.size} grupos abiertos
                </button>
              )}

              {foco !== "todos" && (
                <button type="button" onClick={() => setFoco("todos")} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl border-2 border-[var(--accent)] bg-primary/10 dark:bg-[var(--accent)]/12 px-3 text-xs font-bold text-[var(--accent)]">
                  <Maximize2 className="h-3.5 w-3.5" /> Ver toda la cadena
                </button>
              )}
            </div>

  );
}
