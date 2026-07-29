"use client";

/**
 * ctp-filtros-panel — el panel de facetas de las vistas del Libro CTP.
 *
 * Ingresos, Producción y Despacho hacen la misma pregunta con distintos
 * sustantivos ("¿cuánto entró de Maderera X en rolliza?", "¿qué corridas de
 * shihuahuaco?", "¿qué despaché a este cliente?"). El panel es uno solo: si se
 * clona, a la tercera copia una tiene el botón de limpiar y las otras no.
 *
 * Cada opción muestra su peso (cuántas líneas y cuánto volumen) porque se elige
 * por peso, no por nombre — y porque un desplegable con opciones que devuelven
 * cero es una trampa.
 */

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "@buleje/design-system/icons";

/** Valor presente en el período + su peso. */
export interface FacetaOpcion {
  value: string;
  count: number;
  /** m³ (o la unidad de la vista). Opcional: no toda faceta pesa en volumen. */
  volumeM3?: number;
}

export interface FiltroSelect {
  id: string;
  label: string;
  value: string;
  options: FacetaOpcion[];
  /** Traduce el valor crudo a etiqueta legible (rolliza → Rolliza). */
  etiqueta?: (v: string) => string;
}

export interface FiltroToggle {
  id: string;
  label: string;
  on: boolean;
}

export const BTN_FILTRO =
  "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--surface-canvas)] disabled:opacity-60 max-sm:w-12 max-sm:px-0";
const BTN_ACTIVO =
  "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] max-sm:w-auto max-sm:px-3 dark:text-[var(--accent)]";

/** Botón que abre/cierra el panel, con el número de filtros puestos. */
export function BotonFiltros({
  activos,
  abierto,
  panelId,
  onToggle,
}: {
  activos: number;
  abierto: boolean;
  panelId: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={abierto}
      aria-controls={panelId}
      title="Filtros por especie, proveedor y producto"
      className={`${BTN_FILTRO} ${activos > 0 ? BTN_ACTIVO : ""}`}
    >
      <SlidersHorizontal className="h-4 w-4" />
      <span className="max-sm:sr-only">Filtros</span>
      {activos > 0 && (
        <span className="rounded-full bg-[var(--accent)] px-1.5 text-xs font-bold tabular-nums text-white">
          {activos}
        </span>
      )}
    </button>
  );
}

/**
 * Estado abierto/cerrado del panel. Vive en un hook porque la regla no es
 * trivial: un filtro puesto desde AFUERA (una tarjeta KPI, un aviso de
 * Cumplimiento) tiene que ABRIR el panel — el que llega tiene que ver qué se le
 * aplicó y poder sacarlo. Si lo cerró a mano, queda cerrado.
 */
export function usePanelFiltros(activos: number) {
  const panelId = useId();
  const [abierto, setAbierto] = useState(activos > 0);
  const habia = useRef(activos > 0);
  useEffect(() => {
    if (activos > 0 && !habia.current) setAbierto(true);
    habia.current = activos > 0;
  }, [activos]);
  return { panelId, abierto, alternar: () => setAbierto((v) => !v) };
}

export default function CtpFiltrosPanel({
  id,
  selects,
  toggles,
  activos,
  onSelect,
  onToggle,
  onLimpiar,
  tituloToggles = "Marcas",
}: {
  id: string;
  selects: FiltroSelect[];
  toggles: FiltroToggle[];
  activos: number;
  onSelect: (id: string, valor: string) => void;
  onToggle: (id: string) => void;
  onLimpiar: () => void;
  tituloToggles?: string;
}) {
  return (
    <div
      id={id}
      className="grid gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {selects.map((s) => (
        <SelectFaceta key={s.id} filtro={s} onChange={(v) => onSelect(s.id, v)} />
      ))}
      {(toggles.length > 0 || activos > 0) && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-bold text-[var(--text-primary)]">{tituloToggles}</span>
          <div className="flex flex-wrap items-center gap-2">
            {toggles.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onToggle(t.id)}
                aria-pressed={t.on}
                className={`inline-flex h-9 items-center gap-2 rounded-full border-2 px-3.5 text-sm font-bold transition ${
                  t.on
                    ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]"
                }`}
              >
                {t.label}
              </button>
            ))}
            {activos > 0 && (
              <button
                type="button"
                onClick={onLimpiar}
                className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-bold text-[var(--text-secondary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
              >
                <X className="h-3.5 w-3.5" />
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SelectFaceta({ filtro, onChange }: { filtro: FiltroSelect; onChange: (v: string) => void }) {
  const id = useId();
  const vacio = filtro.options.length === 0;
  return (
    <label htmlFor={id} className="flex flex-col gap-2">
      <span className="text-sm font-bold text-[var(--text-primary)]">{filtro.label}</span>
      <div className="relative">
        <select
          id={id}
          value={filtro.value}
          disabled={vacio}
          onChange={(e) => onChange(e.target.value)}
          className={`h-12 w-full appearance-none rounded-2xl border-2 bg-[var(--surface-canvas)] px-4 pr-10 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] disabled:opacity-50 ${
            filtro.value ? "border-[var(--accent)]" : "border-[var(--rule-base)]"
          }`}
        >
          <option value="">{vacio ? "Sin datos en el período" : `Todos (${filtro.options.length})`}</option>
          {filtro.options.map((o) => (
            <option key={o.value} value={o.value}>
              {(filtro.etiqueta ? filtro.etiqueta(o.value) : o.value)} — {o.count}
              {o.volumeM3 != null ? ` · ${Number(o.volumeM3).toFixed(2)} m³` : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
      </div>
    </label>
  );
}
