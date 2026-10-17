"use client";

import { ChevronLeft, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Crm } from "@/components/admin/crm/use-crm";

/** Paginación de la tabla de clientes. Pieza de CRMTab: recibe `useCrm` entero. */
export default function CrmPaginacion({ crm }: { crm: Crm }) {
  const {
    setPage, filtered, totalPages, effectivePage,
  } = crm;
  return (
    <>
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] bg-[var(--surface-alt)] ">
          <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">
            Página {effectivePage} de {totalPages} · {filtered.length} clientes
          </p>
          <div className="flex items-center gap-1">
            <button aria-label="Anterior"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={effectivePage === 1}
              className="p-1.5 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:bg-[var(--surface-raised)] dark:hover:bg-[var(--surface-raised)] disabled:opacity-40 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)] dark:text-muted" />
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(effectivePage - 2 + i, totalPages - 4 + i));
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn("w-8 h-8 text-xs rounded-lg font-semibold transition-colors",
                    effectivePage === p
                      ? "bg-primary text-white"
                      : "border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] dark:text-muted hover:bg-[var(--surface-raised)] dark:hover:bg-[var(--surface-raised)]"
                  )}
                >
                  {p}
                </button>
              );
            })}
            <button aria-label="Siguiente"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={effectivePage === totalPages}
              className="p-1.5 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] hover:bg-[var(--surface-raised)] dark:hover:bg-[var(--surface-raised)] disabled:opacity-40 transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-[var(--text-secondary)] dark:text-muted" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
