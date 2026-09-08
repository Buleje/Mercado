"use client";

/**
 * La fila de filtros que gobierna los KPIs (ADR-400).
 *
 * Hasta ahora los KPIs decían el total del período y los filtros vivían en la
 * cabecera de las columnas de la tabla: para saber «cuánto entró de tornillo
 * por el permiso X» había que filtrar abajo y sumar a mano, o creerle a un
 * número que hablaba de otra cosa. Acá los filtros están PEGADOS a las cifras
 * que cambian, que es donde se hace la pregunta.
 *
 * Se combinan: elegir especie y permiso a la vez es la consulta real («de esa
 * madera, la de ese título»). Cada uno arranca en «todas», que es el período
 * completo — el estado de siempre.
 *
 * Es una pieza tonta: no sabe de ingresos ni de producción, sólo dibuja los
 * desplegables que le pasan. Las opciones salen de lo que HAY en el período,
 * no de un catálogo: un desplegable con nueve especies cuando el mes tuvo dos
 * obliga a adivinar cuál trae resultados.
 */

import { SlidersHorizontal, X } from "@buleje/design-system/icons";

export interface OpcionKpiFiltro {
  value: string;
  label: string;
  /** Lo que se ve en chico al costado: «12 ingresos · 340.5 m³». */
  hint?: string;
}

export interface CampoKpiFiltro {
  key: string;
  label: string;
  /** Lo que dice la opción vacía: «Todas las especies». */
  todos: string;
  valor: string | undefined;
  opciones: OpcionKpiFiltro[];
  onChange: (valor: string | undefined) => void;
}

export default function CtpKpiFiltros({
  campos,
  onLimpiar,
  nota,
}: {
  campos: CampoKpiFiltro[];
  onLimpiar: () => void;
  /** Qué está mirando ahora mismo, en una línea. */
  nota?: React.ReactNode;
}) {
  /* Un campo sin opciones no se dibuja: un desplegable vacío es una promesa
     que la pantalla no puede cumplir. */
  const visibles = campos.filter((c) => c.opciones.length > 0 || c.valor);
  if (visibles.length === 0) return null;
  const activos = visibles.filter((c) => c.valor).length;

  return (
    <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
      <span className="flex items-center gap-1.5 self-center text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        Filtrar los indicadores
      </span>

      {visibles.map((c) => (
        <label key={c.key} className="flex min-w-[11rem] flex-1 flex-col gap-1 sm:max-w-[15rem]">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            {c.label}
          </span>
          <select
            value={c.valor ?? ""}
            onChange={(e) => c.onChange(e.target.value || undefined)}
            className={`h-10 w-full rounded-lg border bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] ${
              c.valor ? "border-[var(--accent)] font-bold" : "border-[var(--rule-base)]"
            }`}
          >
            <option value="">{c.todos}</option>
            {c.opciones.map((o) => (
              <option key={o.value} value={o.value} title={o.hint}>
                {o.label}
                {o.hint ? ` — ${o.hint}` : ""}
              </option>
            ))}
          </select>
        </label>
      ))}

      {activos > 0 && (
        <button
          type="button"
          onClick={onLimpiar}
          className="flex h-10 items-center gap-1.5 self-end rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)]"
        >
          <X className="h-4 w-4" aria-hidden /> Ver todo
        </button>
      )}

      {/* Qué está mirando: sin esto, un KPI filtrado y uno sin filtrar se ven
          igual, y el número chico se lee como una caída del mes. */}
      {nota && activos > 0 && (
        <p className="w-full text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">{nota}</p>
      )}
    </div>
  );
}
