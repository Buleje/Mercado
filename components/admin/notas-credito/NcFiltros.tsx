"use client";

import { Field } from "@/components/admin/shared/Field";
import { m, AnimatePresence } from "@/components/admin/providers";
import { Search, LayoutGrid, LayoutList, Filter, Kanban } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { STATUS_META, DOC_TYPES } from "@/components/admin/notas-credito/nc-compartido";
import type { NotasCreditoVista } from "@/components/admin/notas-credito/hooks/use-notas-credito";

/** Tipo de documento, buscador y filtros de Notas de crédito. Pieza de NotasCreditoModule: recibe `useNotasCredito` entero. */
export default function NcFiltros({ nc }: { nc: NotasCreditoVista }) {
  const {
    search, setSearch, statusFilter, setStatusFilter, docTypeFilter, setDocTypeFilter, viewMode,
    setViewMode, dateFrom, setDateFrom, dateTo, setDateTo, minAmount, setMinAmount, maxAmount,
    setMaxAmount, showAdvFilters, setShowAdvFilters, searchRef, filteredNotas, activeFilterCount,
  } = nc;
  return (
    <>
      {/* ── Doc Type Tabs + Search + Filters ───────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {DOC_TYPES.map(dt => {
            const Icon = dt.icon;
            return (
              <button key={dt.id} onClick={() => setDocTypeFilter(dt.id)}
                className={cn("flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-colors whitespace-nowrap",
                  docTypeFilter === dt.id ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]")}>
                <Icon className="h-3.5 w-3.5" />
                {dt.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
            <input ref={searchRef} type="text" placeholder="Buscar por número, cliente, RUC/DNI..."
              aria-label="Buscar documentos" value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
          <div className="flex gap-1 items-center">
            {(["", "BORRADOR", "EMITIDA", "ANULADA"] as const).map(s => {
              const count = s === "" ? filteredNotas.length : filteredNotas.filter(n => n.status === s).length;
              return (
                <button key={s} onClick={() => setStatusFilter(s)}
                  className={cn("shrink-0 px-3 py-2 rounded-xl text-xs font-bold transition-colors inline-flex items-center gap-1.5",
                    statusFilter === s ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]")}>
                  {s === "" ? "Todos" : STATUS_META[s].label}
                  {count > 0 && <span className={cn("px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold min-w-4.5 text-center", statusFilter === s ? "bg-white/20" : "bg-[var(--rule-soft)]")}>{count}</span>}
                </button>
              );
            })}
            <button onClick={() => setShowAdvFilters(s => !s)}
              aria-label="Filtros avanzados"
              aria-expanded={showAdvFilters}
              className={cn("p-2 rounded-xl transition-colors relative", showAdvFilters ? "bg-primary text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-[var(--rule-soft)]")}>
              <Filter className="h-4 w-4" />
              {activeFilterCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--data-error-500)] text-white text-[length:var(--ts-2xs)] font-bold flex items-center justify-center">{activeFilterCount}</span>}
            </button>
            <div className="flex items-center gap-0.5 bg-[var(--surface-sunken)] rounded-xl p-1">
              {([["table", LayoutList], ["cards", LayoutGrid], ["kanban", Kanban]] as const).map(([mode, Icon]) => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  title={mode === "table" ? "Tabla" : mode === "cards" ? "Tarjetas" : "Kanban"}
                  className={cn("p-1.5 rounded-xl transition-colors", viewMode === mode ? "bg-[var(--surface-raised)] text-primary " : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]")}>
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showAdvFilters && (
            <m.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[var(--surface-alt)] rounded-xl p-3">
                <Field label="Desde" labelClassName="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] block mb-1">
                  <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)]" />
                </Field>
                <Field label="Hasta" labelClassName="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] block mb-1">
                  <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)]" />
                </Field>
                <Field label="Monto min" labelClassName="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] block mb-1">
                  <input type="number" value={minAmount} onChange={e => setMinAmount(e.target.value)} placeholder="0"
                    className="w-full px-2 py-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)]" />
                </Field>
                <Field label="Monto max" labelClassName="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] block mb-1">
                  <input type="number" value={maxAmount} onChange={e => setMaxAmount(e.target.value)} placeholder={"\u221e"}
                    className="w-full px-2 py-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs text-[var(--text-primary)]" />
                </Field>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
