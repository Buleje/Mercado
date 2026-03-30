"use client";

import React from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

interface ResponsiveTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  emptyIcon?: React.ComponentType<{ className?: string }>;
  emptyMessage?: string;
  emptySubMessage?: string;
  loading?: boolean;
  loadingRows?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cellValue<T>(item: T, col: Column<T>): React.ReactNode {
  if (col.render) return col.render(item);
  const val = (item as Record<string, unknown>)[col.key];
  if (val === null || val === undefined) return "—";
  return String(val);
}

// ---------------------------------------------------------------------------
// Skeleton shimmer block
// ---------------------------------------------------------------------------

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block animate-pulse rounded bg-muted/40 ${className}`}
      aria-hidden
    />
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState({
  icon: Icon,
  message,
  subMessage,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  message: string;
  subMessage?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted">
      {Icon && <Icon className="h-12 w-12 opacity-40" />}
      <p className="text-base font-medium">{message}</p>
      {subMessage && <p className="text-sm opacity-70">{subMessage}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop table (hidden below sm)
// ---------------------------------------------------------------------------

function DesktopTable<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  loading,
  loadingRows = 5,
}: ResponsiveTableProps<T>) {
  return (
    <div className="hidden sm:block overflow-x-auto rounded-xl border border-[var(--border-card-border,theme(colors.gray.200))]">
      <table className="w-full text-sm text-left text-[var(--text-foreground)]">
        <thead>
          <tr className="border-b border-[var(--border-card-border,theme(colors.gray.200))] bg-[#0f766e]/10 text-[#0f766e] dark:bg-[#0f766e]/20 dark:text-emerald-300">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 font-semibold whitespace-nowrap ${col.className ?? ""}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading
            ? Array.from({ length: loadingRows }).map((_, i) => (
                <tr
                  key={`skel-${i}`}
                  className="border-b border-[var(--border-card-border,theme(colors.gray.100))]"
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Shimmer className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            : data.map((item, idx) => (
                <tr
                  key={keyExtractor(item)}
                  onClick={onRowClick ? () => onRowClick(item) : undefined}
                  className={`
                    border-b border-[var(--border-card-border,theme(colors.gray.100))]
                    ${idx % 2 === 0 ? "bg-[var(--bg-card,white)] dark:bg-[var(--bg-card,#1a1a1a)]" : "bg-[#0f766e]/[0.03] dark:bg-[#0f766e]/[0.06]"}
                    ${onRowClick ? "cursor-pointer hover:bg-[#0f766e]/10 dark:hover:bg-[#0f766e]/20 transition-colors" : ""}
                  `}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 ${col.className ?? ""}`}
                    >
                      {cellValue(item, col)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile cards (visible below sm)
// ---------------------------------------------------------------------------

function MobileCards<T>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  loading,
  loadingRows = 4,
}: ResponsiveTableProps<T>) {
  const visibleCols = columns.filter((c) => !c.hideOnMobile);

  if (loading) {
    return (
      <div className="sm:hidden flex flex-col gap-3">
        {Array.from({ length: loadingRows }).map((_, i) => (
          <div
            key={`mskel-${i}`}
            className="rounded-xl border border-[var(--border-card-border,theme(colors.gray.200))] bg-[var(--bg-card,white)] dark:bg-[var(--bg-card,#1a1a1a)] p-4 space-y-2"
          >
            {visibleCols.map((col) => (
              <div key={col.key} className="flex justify-between items-center">
                <Shimmer className="h-3 w-16" />
                <Shimmer className="h-3 w-24" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="sm:hidden flex flex-col gap-3">
      {data.map((item) => (
        <div
          key={keyExtractor(item)}
          onClick={onRowClick ? () => onRowClick(item) : undefined}
          className={`
            rounded-xl border border-[var(--border-card-border,theme(colors.gray.200))]
            bg-[var(--bg-card,white)] dark:bg-[var(--bg-card,#1a1a1a)]
            p-4 space-y-2
            ${onRowClick ? "cursor-pointer active:bg-[#0f766e]/10 transition-colors" : ""}
          `}
        >
          {visibleCols.map((col) => (
            <div
              key={col.key}
              className="flex justify-between items-center gap-4"
            >
              <span className="text-sm text-muted shrink-0">{col.header}</span>
              <span className={`text-sm font-semibold text-right text-[var(--text-foreground)] ${col.className ?? ""}`}>
                {cellValue(item, col)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ResponsiveTable<T>(props: ResponsiveTableProps<T>) {
  const {
    data,
    loading,
    emptyIcon,
    emptyMessage = "No hay datos",
    emptySubMessage,
  } = props;

  if (!loading && data.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        message={emptyMessage}
        subMessage={emptySubMessage}
      />
    );
  }

  return (
    <>
      <DesktopTable {...props} />
      <MobileCards {...props} />
    </>
  );
}

export default ResponsiveTable;
