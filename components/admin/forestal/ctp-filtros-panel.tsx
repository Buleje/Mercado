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

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ChevronDown, SlidersHorizontal, X } from "@buleje/design-system/icons";
import type { RangoNumerico } from "@/lib/forestal/ctp-secciones-filtro";

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


/**
 * La mecánica del desplegable de una cabecera, una sola vez.
 *
 * `<details>` nativo para abrir/cerrar sin librería, y el panel en
 * `position: fixed` con la posición MEDIDA al abrir: la tabla vive dentro de un
 * contenedor con `overflow`, que recortaría cualquier `absolute`. Abre hacia
 * arriba cuando no entra abajo (`alto`), como el autofiltro de Excel. Se cierra
 * al click afuera y al scrollear — una posición fija quedaría colgada en el aire.
 */
function usePopoverCabecera(alto: number, ancho = 256) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);

  /**
   * Dónde va el panel: pegado al disparador, arriba o abajo según lo que entre.
   *
   * Devuelve `false` cuando el disparador ya no se ve —ahí sí hay que cerrar:
   * un panel fijo colgado sobre una cabecera que se fue es peor que ninguno.
   */
  const medir = useCallback((): boolean => {
    const r = ref.current?.querySelector("summary")?.getBoundingClientRect();
    if (!r) return false;
    if (r.bottom < 0 || r.top > window.innerHeight) return false;
    const entraAbajo = r.bottom + 4 + alto <= window.innerHeight;
    /* Y que no se corte contra el borde derecho: la última columna de una tabla
       ancha abre su panel justo ahí, y la mitad quedaba fuera de la pantalla
       (visto en la bandeja de Ingresos, 2026-09-10). */
    const left = Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8));
    setPos(entraAbajo ? { top: r.bottom + 4, left } : { bottom: window.innerHeight - r.top + 4, left });
    return true;
  }, [alto, ancho]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /**
     * Al scrollear se REUBICA, no se cierra.
     *
     * Cerrar en cada scroll parecía prolijo hasta que el filtro pasó a admitir
     * varios valores: tildar una opción cambia la cantidad de filas, la página
     * se acomoda, eso dispara un `scroll` — y el panel se cerraba antes de
     * poder tildar la segunda. Medido en el navegador, 2026-09-10.
     */
    const alScrollear = () => {
      if (!el.open) return;
      if (!medir()) el.open = false;
    };
    const clickAfuera = (e: MouseEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("mousedown", clickAfuera);
    document.addEventListener("scroll", alScrollear, true);
    window.addEventListener("resize", alScrollear);
    return () => {
      document.removeEventListener("mousedown", clickAfuera);
      document.removeEventListener("scroll", alScrollear, true);
      window.removeEventListener("resize", alScrollear);
    };
  }, [medir]);

  const alAbrir = (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    if (e.currentTarget.open) medir();
  };
  const estilo = pos ? { position: "fixed" as const, top: pos.top, bottom: pos.bottom, left: pos.left } : undefined;
  return { ref, alAbrir, estilo };
}

/** El disparador del desplegable: mismo alto y borde en todas las cabeceras. */
const SUMMARY_CABECERA =
  "flex h-9 min-w-24 max-w-56 cursor-pointer list-none items-center justify-between gap-1 rounded-lg border-[1.5px] bg-[var(--surface-raised)] pl-2.5 pr-2 text-sm font-medium text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:outline-none [&::-webkit-details-marker]:hidden";

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
 * El filtro DENTRO de la cabecera de su columna — el autofiltro de Excel
 * (Brandon, 2026-09-03), con selección MÚLTIPLE desde 2026-09-10.
 *
 * Es el mismo estado que el panel: no hay un segundo filtro, hay un segundo
 * lugar desde donde tocarlo. Se elige mirando la columna que se quiere acotar,
 * que es como se lee una tabla — en vez de abrir un panel, buscar el select con
 * el nombre correcto y volver.
 *
 * **Por qué dejó de ser un `<select>`:** en el patio la pregunta casi nunca es
 * de un valor —«comercial Y paquetería larga», «tornillo Y cachimbo»— y con uno
 * solo había que mirar la tabla dos veces y sumar a mano. Ahora cada opción se
 * tilda o se destilda: OR adentro de la columna, AND entre columnas.
 *
 * Acepta `string` o `string[]` para no romper a quien todavía pase uno solo, y
 * siempre devuelve la lista completa: el que llama decide si guarda `[]` o
 * `undefined`. Hereda `normal-case` porque el `<thead>` va en versalitas.
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
  value: string | readonly string[] | undefined;
  options: readonly OpcionDeFiltro[];
  etiqueta?: (v: string) => string;
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const { ref, alAbrir, estilo } = usePopoverCabecera(288);
  const elegidos = comoLista(value);
  const vacio = options.length === 0;
  return (
    <details ref={ref} onToggle={alAbrir} className="mt-1.5 block font-normal normal-case tracking-normal">
      <summary
        aria-label={`Filtrar por ${label}${elegidos.length > 0 ? `: ${elegidos.join(", ")}` : ""}`}
        title={elegidos.length > 0 ? elegidos.join(" · ") : `Filtrar por ${label}`}
        className={`${SUMMARY_CABECERA} ${vacio ? "pointer-events-none opacity-50" : ""} ${
          elegidos.length > 0 ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)]"
        }`}
      >
        <span className="truncate">{vacio ? "—" : rotuloDeFiltro(elegidos, placeholder, etiqueta, options)}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 ${elegidos.length > 0 ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}
          aria-hidden
        />
      </summary>
      <div
        role="group"
        aria-label={`Valores de ${label}`}
        style={estilo}
        className="z-50 max-h-72 w-64 overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-lg)]"
      >
        <ListaDeCasillas label={label} elegidos={elegidos} options={options} etiqueta={etiqueta} onChange={onChange} />
      </div>
    </details>
  );
}

/**
 * «Mayor que», «entre X e Y» en la cabecera de una columna de números — el otro
 * autofiltro de Excel (Brandon, 2026-09-03).
 *
 * Dos topes opcionales y nada más: es como se decide en el aserradero («las de
 * más de medio metro cúbico», «rendimiento bajo 50 %»). Un tope vacío no filtra
 * ese lado, así que «≥ 0.5» se escribe llenando sólo el primero.
 */
export function FiltroColumnaRango({
  label,
  unidad,
  paso = 0.1,
  valor,
  onChange,
  placeholder = "Todos",
}: {
  label: string;
  /** m³, %, pz — se dice al lado de cada input y en el resumen. */
  unidad?: string;
  paso?: number;
  valor: RangoNumerico | undefined;
  onChange: (r: RangoNumerico) => void;
  placeholder?: string;
}) {
  const { ref, alAbrir, estilo } = usePopoverCabecera(170, 240);
  const min = valor?.min ?? null;
  const max = valor?.max ?? null;
  const activo = min != null || max != null;
  const resumen = !activo
    ? placeholder
    : min != null && max != null
      ? `${min} – ${max}`
      : min != null
        ? `≥ ${min}`
        : `≤ ${max}`;
  /* Un input vacío es `null` (sin tope), no 0: «≥ 0» dejaría afuera lo negativo
     y, peor, se leería como un filtro puesto cuando el operador sólo borró. */
  const leer = (v: string) => (v.trim() === "" ? null : Number(v));
  const campo =
    "h-10 w-24 rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
  return (
    <details ref={ref} onToggle={alAbrir} className="mt-1.5 block font-normal normal-case tracking-normal">
      <summary
        aria-label={`Filtrar ${label} por rango`}
        className={`${SUMMARY_CABECERA} ${activo ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)]"}`}
      >
        <span className="truncate tabular-nums">{resumen}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 ${activo ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`}
          aria-hidden
        />
      </summary>
      <div
        style={estilo}
        className="z-50 w-60 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-lg)]"
      >
        <p className="mb-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          {label} {unidad ? `(${unidad})` : ""}
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step={paso}
            value={min ?? ""}
            onChange={(e) => onChange({ min: leer(e.target.value), max })}
            placeholder="desde"
            aria-label={`${label} desde`}
            className={campo}
          />
          <span className="text-sm text-[var(--text-tertiary)]">–</span>
          <input
            type="number"
            inputMode="decimal"
            step={paso}
            value={max ?? ""}
            onChange={(e) => onChange({ min, max: leer(e.target.value) })}
            placeholder="hasta"
            aria-label={`${label} hasta`}
            className={campo}
          />
        </div>
        {activo && (
          <button
            type="button"
            onClick={() => onChange({ min: null, max: null })}
            className="mt-2 inline-flex items-center gap-1 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden /> Quitar el rango
          </button>
        )}
      </div>
    </details>
  );
}

/**
 * El mismo autofiltro, con forma de CAMPO — el panel «Filtros» y la fila que
 * gobierna los KPIs.
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
