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
import { usePopoverCabecera } from "@/components/admin/shared/filtros-columna";

/**
 * Una opción de cualquier autofiltro — la de una columna y la de los KPIs.
 *
 * `FacetaOpcion` (el valor del período con su peso) encaja acá sin cambiar
 * nada: se agrega `label`/`hint` para los KPIs, que traen su propio texto.
 */
export interface OpcionDeFiltro {
  value: string;
  /** Cómo se lee. Sin esto se muestra el valor crudo. */
  label?: string;
  /** El peso ya escrito («12 · 340.5 m³»). Sin esto se arma con `count`. */
  hint?: string;
  count?: number;
  volumeM3?: number;
}

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
  /** Uno o VARIOS valores elegidos (multi-selección, 2026-09-10). */
  value: string | readonly string[] | undefined;
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
  "inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--surface-canvas)] disabled:opacity-60 max-sm:w-12 max-sm:px-0";
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
  onSelect: (id: string, valores: string[]) => void;
  onToggle: (id: string) => void;
  onLimpiar: () => void;
  tituloToggles?: string;
}) {
  return (
    <div
      id={id}
      className="grid gap-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:grid-cols-2 lg:grid-cols-4"
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


/** Lo elegido, siempre como lista: un valor suelto se lee como una lista de uno. */
const comoLista = (v: string | readonly string[] | undefined): string[] =>
  v == null ? [] : Array.isArray(v) ? v.filter(Boolean) : v ? [v as string] : [];

/**
 * Qué dice el disparador sin abrirlo: el valor cuando es uno, cuántos cuando
 * son varios. Decir «3 elegidos» y no listarlos es a propósito — la cabecera
 * de una columna mide 12rem y tres especies no entran sin romper la tabla.
 */
function rotuloDeFiltro(
  elegidos: string[],
  placeholder: string,
  etiqueta?: (v: string) => string,
  options: readonly OpcionDeFiltro[] = [],
): string {
  if (elegidos.length === 0) return placeholder;
  if (elegidos.length === 1) {
    const o = options.find((x) => x.value === elegidos[0]);
    return o?.label ?? (etiqueta ? etiqueta(elegidos[0]) : elegidos[0]);
  }
  return `${elegidos.length} elegidos`;
}

/**
 * La lista de casillas del autofiltro, compartida por la cabecera y el panel.
 *
 * Cada opción trae su peso (líneas y m³) porque se elige por peso, no por
 * nombre — y porque una opción que devuelve cero es una trampa.
 */
function ListaDeCasillas({
  label,
  elegidos,
  options,
  etiqueta,
  onChange,
  unico = false,
}: {
  label: string;
  elegidos: string[];
  options: readonly OpcionDeFiltro[];
  etiqueta?: (v: string) => string;
  onChange: (v: string[]) => void;
  /** `true` = de a uno (el filtro viaja al servidor y sólo admite un valor). */
  unico?: boolean;
}) {
  const marcadas = new Set(elegidos);
  const textoDe = (o: OpcionDeFiltro) => o.label ?? (etiqueta ? etiqueta(o.value) : o.value);
  const pesoDe = (o: OpcionDeFiltro) =>
    o.hint ?? (o.count == null ? "" : `${o.count}${o.volumeM3 != null ? ` · ${Number(o.volumeM3).toFixed(2)}` : ""}`);
  return (
    <>
      {options.length === 0 && <p className="px-2 py-1.5 text-sm text-[var(--text-tertiary)]">Sin valores</p>}
      {elegidos.length > 0 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="mb-1 block w-full rounded-lg px-2 py-1 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          Limpiar ({elegidos.length})
        </button>
      )}
      {options.map((o) => {
        const marcado = marcadas.has(o.value);
        return (
          <label
            key={o.value}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[var(--surface-sunken)] ${
              marcado ? "bg-primary/10 font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
            }`}
          >
            <input
              type={unico ? "radio" : "checkbox"}
              name={unico ? `filtro-${label}` : undefined}
              checked={marcado}
              aria-label={`${label}: ${textoDe(o)}`}
              onChange={() =>
                onChange(unico ? [o.value] : marcado ? elegidos.filter((x) => x !== o.value) : [...elegidos, o.value])
              }
              className="h-4 w-4 shrink-0 cursor-pointer accent-[var(--accent)]"
            />
            <span className="min-w-0 flex-1 truncate" title={textoDe(o)}>{textoDe(o)}</span>
            <span className="shrink-0 font-mono text-[length:var(--ts-2xs)] tabular-nums text-[var(--text-tertiary)]">
              {pesoDe(o)}
            </span>
          </label>
        );
      })}
    </>
  );
}

/**
 * El mismo autofiltro, con forma de CAMPO — el panel «Filtros» y la fila que
 * gobierna los KPIs.
 *
 * La versión de CABECERA (el `<th>` de una tabla) ya no vive acá: es
 * `FiltroColumnaMulti`/`FiltroColumnaRango` de
 * `@/components/admin/shared/filtros-columna` (Fase 2, 2026-09-22) — no tenían
 * nada de forestal, eran la misma mecánica de popover que ésta. Lo que sigue
 * acá es lo que SÍ es del libro: el peso en m³/piezas (`FacetaOpcion`, con
 * `volumeM3`) y el campo con forma de formulario para el panel «Filtros» y las
 * tarjetas de KPI, que no tienen equivalente genérico.
 *
 * Misma lista de tildes que la cabecera: elegir dos especies se hace igual en
 * los tres lugares. Lo único que cambia es el disparador, porque acá vive en un
 * formulario y no en un `<thead>`: alto de campo, esquinas de campo.
 */
export function CampoDeFiltro({
  label,
  value,
  options,
  etiqueta,
  onChange,
  placeholder = "Todos",
  compacto = false,
  unico = false,
  className = "",
  textoVacio = "Sin datos en el período",
}: {
  label: string;
  value: string | readonly string[] | undefined;
  options: readonly OpcionDeFiltro[];
  etiqueta?: (v: string) => string;
  onChange: (v: string[]) => void;
  /** Lo que dice cuando no hay nada elegido («Todas las especies»). */
  placeholder?: string;
  /**
   * Qué decir cuando el filtro se queda sin opciones.
   *
   * El default culpa al período, y eso es cierto en Ingresos o Producción. NO
   * lo es en «Productos disponibles», donde el período no acota el saldo del
   * depósito (ver el endpoint: `soloDelPeriodo`): ahí un «Sin datos en el
   * período» manda al operador a cambiar un período que no cambia nada.
   */
  textoVacio?: string;
  /** `true` = alto 10 y esquinas chicas (la fila de los KPIs). */
  compacto?: boolean;
  /** `true` = de a uno: el filtro viaja al servidor y sólo admite un valor. */
  unico?: boolean;
  className?: string;
}) {
  const { ref, alAbrir, estilo } = usePopoverCabecera(288);
  const elegidos = comoLista(value);
  const vacio = options.length === 0;
  return (
    <details ref={ref} onToggle={alAbrir} className={`block ${className}`}>
      <summary
        aria-label={`Filtrar por ${label}${elegidos.length > 0 ? `: ${elegidos.join(", ")}` : ""}`}
        title={elegidos.length > 0 ? elegidos.join(" · ") : `Filtrar por ${label}`}
        className={`flex w-full cursor-pointer list-none items-center justify-between gap-2 bg-[var(--surface-canvas)] font-medium text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none [&::-webkit-details-marker]:hidden ${
          compacto ? "h-10 rounded-lg border px-2 text-sm" : "h-12 rounded-2xl border-2 px-4 text-sm"
        } ${vacio ? "pointer-events-none opacity-50" : ""} ${
          elegidos.length > 0 ? "border-[var(--accent)] font-bold" : "border-[var(--rule-base)]"
        }`}
      >
        <span className="min-w-0 flex-1 truncate">
          {vacio ? textoVacio : rotuloDeFiltro(elegidos, placeholder, etiqueta, options)}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 ${elegidos.length > 0 ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}
          aria-hidden
        />
      </summary>
      <div
        role="group"
        aria-label={`Valores de ${label}`}
        style={estilo}
        className="z-50 max-h-72 w-64 overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-lg)]"
      >
        <ListaDeCasillas
          label={label}
          elegidos={elegidos}
          options={options}
          etiqueta={etiqueta}
          onChange={onChange}
          unico={unico}
        />
      </div>
    </details>
  );
}

/** El campo del panel «Filtros»: `CampoDeFiltro` con el rótulo arriba. */
function SelectFaceta({ filtro, onChange }: { filtro: FiltroSelect; onChange: (v: string[]) => void }) {
  return (
    <div className={`flex flex-col gap-2 ${filtro.soloMobile ? "sm:hidden" : ""}`}>
      <span className="text-sm font-bold text-[var(--text-primary)]">{filtro.label}</span>
      <CampoDeFiltro
        label={filtro.label}
        value={filtro.value}
        options={filtro.options}
        etiqueta={filtro.etiqueta}
        onChange={onChange}
        placeholder={`Todos (${filtro.options.length})`}
      />
    </div>
  );
}
