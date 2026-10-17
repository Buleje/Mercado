"use client";

import { Field } from "@/components/admin/shared/Field";
import { m, AnimatePresence } from "@/components/admin/providers";
import { Search, LayoutGrid, LayoutList, Filter, Kanban } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { STATUS_META } from "@/components/admin/notas-credito/nc-compartido";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

/** Tipo de documento, buscador y filtros de Notas de crédito. Pieza de NotasCreditoModule: recibe `useNotasCredito` entero. */
export default function NcFiltros({ nc }: { nc: NotasCreditoVista }) {
  const {
    search, setSearch, statusFilter, setStatusFilter, viewMode,
    setViewMode, dateFrom, setDateFrom, dateTo, setDateTo, minAmount, setMinAmount, maxAmount,
    setMaxAmount, showAdvFilters, setShowAdvFilters, searchRef, filteredNotas, activeFilterCount,
  } = nc;
  const chip = (activo: boolean) => cn("inline-flex h-12 shrink-0 items-center gap-1.5 rounded-2xl border-[1.5px] px-3 text-sm font-bold transition-colors",
    activo ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)]");
  return (
    <>
      {/* Una fila pegada a la tabla: buscador · estado · filtros · vista. El filtro «por tipo de documento»
          (Todos/Facturas/Boletas/Notas de Crédito) no filtraba nada —el estado nunca se leía— y «Notas de
          Crédito» dentro de Notas de crédito sobraba: se quitó. */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1 basis-full sm:basis-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
            <input ref={searchRef} type="text" placeholder="Buscar por número, cliente, RUC/DNI..."
              aria-label="Buscar documentos" value={search} onChange={e => setSearch(e.target.value)}
              className="h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <select aria-label="Estado de la nota" value={statusFilter} onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="h-12 min-w-0 flex-1 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] sm:hidden">
            {(["", "BORRADOR", "EMITIDA", "ANULADA"] as const).map(s => (
              <option key={s} value={s}>{s === "" ? "Todos" : STATUS_META[s].label}</option>
            ))}
          </select>
          <div className="hidden flex-wrap items-center gap-2 sm:flex" role="group" aria-label="Estado de la nota">
            {(["", "BORRADOR", "EMITIDA", "ANULADA"] as const).map(s => {
              const count = s === "" ? filteredNotas.length : filteredNotas.filter(n => n.status === s).length;
              return (
                <button key={s} type="button" onClick={() => setStatusFilter(s)} aria-pressed={statusFilter === s} className={chip(statusFilter === s)}>
                  {s === "" ? "Todos" : STATUS_META[s].label}
                  {count > 0 && <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-sm tabular-nums text-[var(--text-tertiary)]">{count}</span>}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => setShowAdvFilters(s => !s)}
            aria-label="Filtros avanzados" title="Fechas y montos"
            aria-expanded={showAdvFilters}
            className={cn(chip(showAdvFilters), "relative w-12 justify-center px-0")}>
            <Filter className="h-4 w-4" aria-hidden />
            {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--data-error-500)] px-1 text-sm font-bold text-white">{activeFilterCount}</span>}
          </button>
          <div className="flex items-center gap-1" role="group" aria-label="Cómo ver las notas">
            {([["table", LayoutList, "Tabla"], ["cards", LayoutGrid, "Tarjetas"], ["kanban", Kanban, "Tablero"]] as const).map(([mode, Icon, rotulo]) => (
              <button key={mode} type="button" onClick={() => setViewMode(mode)} title={rotulo} aria-label={rotulo} aria-pressed={viewMode === mode}
                className={cn(chip(viewMode === mode), "w-12 justify-center px-0")}>
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence>
          {showAdvFilters && (
            <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[var(--surface-alt)] rounded-xl p-3">
                <Field label="Desde" labelClassName="text-sm font-bold text-[var(--text-secondary)] block mb-1">
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="h-12 w-full px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)]" />
                </Field>
                <Field label="Hasta" labelClassName="text-sm font-bold text-[var(--text-secondary)] block mb-1">
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="h-12 w-full px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)]" />
                </Field>
                <Field label="Monto min" labelClassName="text-sm font-bold text-[var(--text-secondary)] block mb-1">
                  <input type="number" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="0"
                    className="h-12 w-full px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)]" />
                </Field>
                <Field label="Monto max" labelClassName="text-sm font-bold text-[var(--text-secondary)] block mb-1">
                  <input type="number" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} placeholder={"\u221e"}
                    className="h-12 w-full px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)]" />
                </Field>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
