"use client";

import { useState } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "@buleje/design-system/icons";
import type { ReactNode } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SAColumn<T = Record<string, unknown>> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  // legacy compat
  header?: string;
  className?: string;
}

interface Pagination {
  page: number;
  total: number;
  onPageChange: (page: number) => void;
}

interface SADataTableProps<T = Record<string, unknown>> {
  columns: SAColumn<T>[];
  data?: T[];
  /** Legacy prop alias */
  rows?: T[];
  rowKey?: (row: T) => string;
  pagination?: Pagination;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  /**
   * Brandon 2026-05-20 v13 audit superadmin responsive — render alternativo
   * para mobile (<768px). Si presente, la tabla se reemplaza por un stack
   * de cards. Si NO presente, la tabla queda con `overflow-x-auto` (fallback
   * actual). Backward-compat total.
   */
  renderMobileCard?: (row: T, index: number) => ReactNode;
}

type SortDir = "asc" | "desc" | null;

// ─── Component ────────────────────────────────────────────────────────────────

export function SADataTable<T = Record<string, unknown>>({
  columns,
  data,
  rows,
  rowKey,
  pagination,
  emptyMessage = "Sin resultados",
  onRowClick,
  renderMobileCard,
}: SADataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  // Support both `data` and legacy `rows` prop
  const source = data ?? rows ?? undefined;

  // Loading skeleton when data is undefined
  if (source === undefined) {
    return (
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] animate-pulse">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]/60">
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-3">
                  <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-[var(--rule-base)]">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3">
                    <div className="h-4 w-full rounded bg-gray-200 dark:bg-gray-700" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Client-side sort (only when data is provided without server pagination)
  const displayed = [...source];
  if (sortKey && sortDir) {
    displayed.sort((a, b) => {
      const av = (a as Record<string, unknown>)[sortKey];
      const bv = (b as Record<string, unknown>)[sortKey];
      const cmp =
        av == null ? -1
        : bv == null ? 1
        : typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }

  const handleSort = (key: string) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir("asc");
    } else if (sortDir === "asc") {
      setSortDir("desc");
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  };

  const totalPages = pagination ? Math.ceil(pagination.total / Math.max(1, source.length)) : 1;

  return (
    <div className="space-y-3">
      {/* Brandon 2026-05-20 v13 audit superadmin responsive: card view
          mobile alternativo. Solo se monta si el consumer pasa
          `renderMobileCard`. Para back-compat, si NO pasa el prop, la
          tabla queda visible con overflow-x-auto en mobile como antes. */}
      {renderMobileCard && displayed.length > 0 && (
        <div className="md:hidden space-y-3">
          {displayed.map((row, idx) => {
            const key = rowKey ? rowKey(row) : String(idx);
            return (
              <div
                key={key}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={[
                  "rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 transition-colors",
                  onRowClick ? "cursor-pointer active:scale-[0.99] active:bg-[var(--surface-sunken)]" : "",
                ].join(" ")}
              >
                {renderMobileCard(row, idx)}
              </div>
            );
          })}
        </div>
      )}
      {renderMobileCard && displayed.length === 0 && (
        <div className="md:hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
          {emptyMessage}
        </div>
      )}

      <div
        className={[
          "rounded-xl border border-[var(--rule-base)]",
          // Cuando hay renderMobileCard, ocultamos la tabla en mobile
          // (los cards arriba la reemplazan). Sin renderMobileCard,
          // la tabla queda visible con scroll horizontal (fallback).
          renderMobileCard ? "hidden md:block overflow-x-auto" : "overflow-x-auto",
        ].join(" ")}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]/60">
              {columns.map((col) => {
                const colLabel = col.label ?? col.header ?? col.key;
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    className={[
                      "text-left px-4 py-3 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider whitespace-nowrap",
                      col.sortable ? "cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200" : "",
                      col.className ?? "",
                    ].join(" ")}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {colLabel}
                      {col.sortable && (
                        isSorted && sortDir === "asc" ? <ChevronUp className="w-3 h-3" />
                        : isSorted && sortDir === "desc" ? <ChevronDown className="w-3 h-3" />
                        : <ChevronsUpDown className="w-3 h-3 opacity-40" />
                      )}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-[var(--text-tertiary)]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              displayed.map((row, idx) => {
                const key = rowKey ? rowKey(row) : String(idx);
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={[
                      "border-b border-[var(--rule-base)] last:border-0 transition-colors",
                      idx % 2 === 0
                        ? "bg-[var(--surface-raised)]"
                        : "bg-gray-50/50 dark:bg-gray-900/60",
                      onRowClick ? "cursor-pointer hover:bg-teal-50 dark:hover:bg-teal-900/10" : "",
                    ].join(" ")}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-[var(--text-secondary)] ${col.className ?? ""}`}
                      >
                        {col.render
                          ? col.render(row)
                          : String((row as Record<string, unknown>)[col.key] ?? "")}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination — Brandon 2026-05-20 v13 audit superadmin responsive:
          tap targets w-7 h-7 (28px) por debajo del mínimo WCAG (44px).
          Ahora w-10 h-10 (40px) en mobile, w-9 h-9 (36px) en desktop.
          Layout stack-on-mobile: info text y botones en columnas separadas. */}
      {pagination && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4 text-xs sm:text-sm text-[var(--text-tertiary)] px-1">
          <span className="text-center sm:text-left">
            Página {pagination.page} de {totalPages} ({pagination.total} total)
          </span>
          <div className="flex items-center justify-center sm:justify-end gap-1">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              aria-label="Página anterior"
              className="inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded border border-[var(--rule-base)] disabled:opacity-40 hover:bg-[var(--surface-sunken)] active:scale-95 transition-all"
            >
              ‹
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(pagination.page - 2, totalPages - 4)) + i;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => pagination.onPageChange(p)}
                  aria-label={`Ir a página ${p}`}
                  aria-current={p === pagination.page ? "page" : undefined}
                  className={[
                    "h-10 w-10 sm:h-9 sm:w-9 rounded border transition-all active:scale-95",
                    p === pagination.page
                      ? "bg-[var(--accent-dark)] text-white border-[var(--accent-dark)]"
                      : "border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]",
                  ].join(" ")}
                >
                  {p}
                </button>
              );
            })}
            <button
              type="button"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              aria-label="Página siguiente"
              className="inline-flex h-10 w-10 sm:h-9 sm:w-9 items-center justify-center rounded border border-[var(--rule-base)] disabled:opacity-40 hover:bg-[var(--surface-sunken)] active:scale-95 transition-all"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
