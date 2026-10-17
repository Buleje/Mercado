"use client";

import { ListChecks, Search, X } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { SugerenciasCompra } from "./use-sugerencias-compra";
import type { AgruparPor, FilterKey } from "./tipos";

const TONO: Record<"neutro" | "error" | "aviso" | "exito", string> = {
  neutro: "border-[var(--text-tertiary)] bg-[var(--surface-sunken)] text-[var(--text-primary)]",
  error: "border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)]",
  aviso: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)]",
  exito: "border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 text-[var(--data-success-ink)]",
};

/** Chip de filtro: botón secundario del DS (48 px) a 14 px; encendido toma su tono. */
const chip = (activo: boolean, tono: keyof typeof TONO) =>
  button({ variant: "secondary", className: cn("shrink-0 gap-1.5 rounded-xl px-3 text-sm", activo ? TONO[tono] : "text-[var(--text-secondary)]") });

/**
 * La fila de filtros de Sugerencias, pegada a la lista (10-10): buscar, cómo
 * agrupar (por urgencia o, desde el 17-10, por causa: C26), la urgencia (con
 * su cuenta), «Sin proveedor» y marcar lo que se ve. Antes el
 * buscador era una fila propia y los chips otra, y el aviso «N sin proveedor»
 * un tercer renglón que hacía lo mismo que su chip.
 */
export default function SugerenciasFiltros({ sc }: { sc: SugerenciasCompra }) {
  const { filter, setFilter, search, setSearch, stats, visible, selected, selectAllVisible, agruparPor, setAgruparPor } = sc;
  const chips: Array<{ id: FilterKey; label: string; count: number; tono: keyof typeof TONO }> = [
    { id: "todos", label: "Todos", count: stats.total, tono: "neutro" },
    { id: "CRITICO", label: "Críticos", count: stats.counts.CRITICO, tono: "error" },
    { id: "URGENTE", label: "Urgentes", count: stats.counts.URGENTE, tono: "aviso" },
    { id: "PLANIFICAR", label: "Planificar", count: stats.counts.PLANIFICAR, tono: "exito" },
    { id: "sin-proveedor", label: "Sin proveedor", count: stats.withoutSupplier, tono: "aviso" },
  ];
  const todosVisiblesMarcados = visible.length > 0 && visible.every((s) => selected.has(s.productId));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative h-12 min-w-0 grow basis-full sm:basis-44">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          type="search"
          placeholder="Buscar producto…"
          aria-label="Buscar producto o categoría"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={cn("h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-10 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-primary", search ? "pr-12" : "pr-3")}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      <select
        value={agruparPor}
        onChange={(e) => setAgruparPor(e.target.value as AgruparPor)}
        aria-label="Agrupar por"
        title="Por urgencia: cuándo se acaba. Por causa: por qué entra en la lista."
        className="h-12 shrink-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-primary"
      >
        <option value="urgencia">Por urgencia</option>
        <option value="causa">Por causa</option>
      </select>
      {chips.map((c) =>
        c.id === "sin-proveedor" && c.count === 0 ? null : (
          <button
            key={c.id}
            type="button"
            onClick={() => setFilter(c.id)}
            aria-pressed={filter === c.id}
            title={c.id === "sin-proveedor" ? "Sin proveedor anterior: su orden queda pendiente de asignarle uno" : undefined}
            className={chip(filter === c.id, c.tono)}
          >
            {c.label}
            <span className="tabular-nums font-bold">{c.count}</span>
          </button>
        ),
      )}
      {/* Ícono con rótulo al pasar (regla 6: compactar antes que partir la
          fila): con «Agrupar por» el texto la partía a 1280 px (17-10). */}
      {visible.length > 0 && (
        <button
          type="button"
          onClick={selectAllVisible}
          aria-label={todosVisiblesMarcados ? "Desmarcar lo visible" : "Marcar lo visible"}
          title={todosVisiblesMarcados ? "Desmarcar lo visible" : "Marcar lo visible"}
          aria-pressed={todosVisiblesMarcados}
          data-qa="marcar-visible"
          className={button({ variant: "ghost", size: "icon", className: "ml-auto shrink-0 rounded-xl text-[var(--accent-ink)] dark:text-[var(--accent)]" })}
        >
          <ListChecks className="h-5 w-5" aria-hidden />
        </button>
      )}
    </div>
  );
}
