import { useState, useMemo } from "react";

export interface PaginationResult<T> {
  page: number;
  pageSize: number;
  totalPages: number;
  total: number;
  items: T[];
  setPage: (p: number) => void;
  setPageSize: (s: number) => void;
  reset: () => void;
}

/**
 * Lightweight client-side pagination hook.
 * Usage: const pg = usePagination(allItems, 25);
 * Render pg.items, navigate with pg.setPage(n).
 */
export function usePagination<T>(
  data: T[],
  initialPageSize = 25,
): PaginationResult<T> {
  const [page, setPageState] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const totalPages = Math.max(1, Math.ceil(data.length / pageSize));

  const items = useMemo(() => {
    const start = (page - 1) * pageSize;
    return data.slice(start, start + pageSize);
  }, [data, page, pageSize]);

  const setPage = (p: number) => {
    setPageState(Math.min(Math.max(1, p), Math.max(1, totalPages)));
  };

  const setPageSize = (s: number) => {
    setPageSizeState(s);
    setPageState(1);
  };

  const reset = () => setPageState(1);

  return { page, pageSize, totalPages, total: data.length, items, setPage, setPageSize, reset };
}

interface PaginatorProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
  pageSizeOptions?: number[];
}

/**
 * Reusable pagination bar component (no external deps).
 */
export function Paginator({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  onPageSize,
  pageSizeOptions = [25, 50, 100],
}: PaginatorProps) {
  if (totalPages <= 1 && total <= pageSizeOptions[0]) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Build visible page numbers
  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border">
      <p className="text-xs text-muted">
        {start}–{end} de {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="px-2 py-1 text-xs rounded-lg border border-border disabled:opacity-40 hover:bg-accent transition-colors"
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`ellipsis-${i}`} className="px-2 py-1 text-xs text-muted">
              …
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p as number)}
              className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${
                p === page
                  ? "bg-primary text-white border-primary"
                  : "border-border hover:bg-accent"
              }`}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="px-2 py-1 text-xs rounded-lg border border-border disabled:opacity-40 hover:bg-accent transition-colors"
        >
          ›
        </button>
      </div>
      {onPageSize && (
        <select
          value={pageSize}
          onChange={e => onPageSize(Number(e.target.value))}
          className="text-xs rounded-lg border border-border bg-background px-2 py-1"
        >
          {pageSizeOptions.map(s => (
            <option key={s} value={s}>{s} por página</option>
          ))}
        </select>
      )}
    </div>
  );
}
