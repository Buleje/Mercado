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
  /**
   * Este filtro YA vive en la cabecera de su columna (≥640px), así que acá sólo
   * se dibuja en móvil — donde la tabla no existe y en su lugar hay cards.
   *
   * Es la regla que pidió Brandon (2026-09-03): lo que es una columna se filtra
   * desde su columna, estilo Excel; el botón «Filtros» queda para lo
   * especializado (marcas, y las columnas que estén ocultas). No se duplica el
   * control en desktop porque dos controles del mismo estado enseñan a dudar de
   * cuál manda.
   */
  soloMobile?: boolean;
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
      {/* Sin nada más que las marcas, el panel quedaría mudo sobre dónde fueron
          a parar los filtros de columna. Se dice, una sola vez y sólo cuando
          hay tabla (≥640px). */}
      {selects.some((s) => s.soloMobile) && (
        <p className="hidden text-sm text-[var(--text-tertiary)] sm:block">
          {selects.filter((s) => s.soloMobile).map((s) => s.label).join(", ")} se filtran{" "}
          <b className="text-[var(--text-secondary)]">desde su encabezado en la tabla</b>.
        </p>
      )}
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

/**
 * El filtro DENTRO de la cabecera de su columna — el autofiltro de Excel
 * (Brandon, 2026-09-03).
 *
 * Es el mismo estado que el panel: no hay un segundo filtro, hay un segundo
 * lugar desde donde tocarlo. Se elige mirando la columna que se quiere acotar,
 * que es como se lee una tabla — en vez de abrir un panel, buscar el select con
 * el nombre correcto y volver.
 *
 * Cada opción trae su peso (líneas y m³) por lo mismo que en el panel: se elige
 * por peso y una opción que devuelve cero es una trampa. Y hereda el `normal-case`
 * porque el `<thead>` va en versalitas: un select en mayúsculas no se lee.
 */
export function FiltroColumna({
  label,
  value,
  options,
  etiqueta,
  onChange,
  placeholder = "Todos",
}: {
  /** Cómo se llama la columna: arma el `aria-label` del control. */
  label: string;
  value: string;
  options: FacetaOpcion[];
  etiqueta?: (v: string) => string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const vacio = options.length === 0;
  return (
    <span className="relative mt-1.5 block font-normal normal-case tracking-normal">
      <select
        value={value}
        disabled={vacio}
        aria-label={`Filtrar por ${label}`}
        onChange={(e) => onChange(e.target.value)}
        className={`h-9 w-full min-w-24 max-w-56 appearance-none truncate rounded-lg border-[1.5px] bg-[var(--surface-raised)] pl-2.5 pr-7 text-sm font-medium text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)] disabled:opacity-50 ${
          value ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)]"
        }`}
      >
        <option value="">{vacio ? "—" : placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {(etiqueta ? etiqueta(o.value) : o.value)} ({o.count})
          </option>
        ))}
      </select>
      <ChevronDown
        className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${
          value ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"
        }`}
        aria-hidden
      />
    </span>
  );
}

/**
 * El autofiltro de VARIOS valores a la vez — la columna «Guía» del patio
 * (Brandon, 2026-09-01: «de esas 3 quiero filtrar 2 al mismo tiempo»).
 *
 * Es la lista de casillas del autofiltro de Excel. `<details>` nativo para
 * abrir/cerrar sin librería; el panel va en `position: fixed` con la posición
 * medida al abrir, porque la tabla vive dentro de un contenedor con `overflow`
 * que recortaría cualquier `absolute`. Se cierra al hacer click afuera y al
 * scrollear (la posición fija quedaría colgada en el aire).
 */
export function FiltroColumnaMulti({
  label,
  value,
  options,
  onChange,
  placeholder = "Todas",
}: {
  label: string;
  value: readonly string[];
  options: FacetaOpcion[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  /* `top` si entra debajo del botón; `bottom` (medido desde el borde inferior de
     la ventana) cuando la cabecera está al pie de la pantalla y la lista
     quedaría cortada — se abre hacia arriba, como el autofiltro de Excel. */
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cerrar = () => {
      if (el.open) el.open = false;
    };
    const clickAfuera = (e: MouseEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("mousedown", clickAfuera);
    document.addEventListener("scroll", cerrar, true);
    return () => {
      document.removeEventListener("mousedown", clickAfuera);
      document.removeEventListener("scroll", cerrar, true);
    };
  }, []);
  const elegidas = new Set(value);
  const resumen = value.length === 0 ? placeholder : value.length === 1 ? value[0] : `${value.length} elegidas`;
  return (
    <details
      ref={ref}
      onToggle={(e) => {
        const d = e.currentTarget;
        if (!d.open) return;
        const r = d.querySelector("summary")?.getBoundingClientRect();
        if (!r) return;
        /* 16rem = el `max-h-64` de la lista. Si no entra abajo, va arriba. */
        const entraAbajo = r.bottom + 4 + 256 <= window.innerHeight;
        setPos(entraAbajo ? { top: r.bottom + 4, left: r.left } : { bottom: window.innerHeight - r.top + 4, left: r.left });
      }}
      className="mt-1.5 block font-normal normal-case tracking-normal"
    >
      <summary
        aria-label={`Filtrar por ${label}`}
        className={`flex h-9 min-w-24 max-w-56 cursor-pointer list-none items-center justify-between gap-1 rounded-lg border-[1.5px] bg-[var(--surface-raised)] pl-2.5 pr-2 text-sm font-medium text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none [&::-webkit-details-marker]:hidden ${
          value.length > 0 ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)]"
        }`}
      >
        <span className="truncate">{resumen}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 ${value.length > 0 ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}
          aria-hidden
        />
      </summary>
      <div
        role="group"
        aria-label={`Valores de ${label}`}
        style={pos ? { position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left } : undefined}
        className="z-50 max-h-64 w-64 overflow-y-auto rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-lg)]"
      >
        {options.length === 0 && <p className="px-2 py-1.5 text-sm text-[var(--text-tertiary)]">Sin valores</p>}
        {options.map((o) => (
          <label
            key={o.value}
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            <input
              type="checkbox"
              checked={elegidas.has(o.value)}
              onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((x) => x !== o.value))}
              className="h-4 w-4 accent-[var(--accent)]"
            />
            <span className="flex-1 truncate">{o.value}</span>
            <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{o.count}</span>
          </label>
        ))}
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            {placeholder}
          </button>
        )}
      </div>
    </details>
  );
}

function SelectFaceta({ filtro, onChange }: { filtro: FiltroSelect; onChange: (v: string) => void }) {
  const id = useId();
  const vacio = filtro.options.length === 0;
  return (
    <label htmlFor={id} className={`flex flex-col gap-2 ${filtro.soloMobile ? "sm:hidden" : ""}`}>
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
