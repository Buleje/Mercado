import React from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────
export interface Column {
  key: string;
  label: string;
  align?: "left" | "center" | "right";
  sortable?: boolean;
  width?: string;
}

interface AdminTableProps {
  columns: Column[];
  children: React.ReactNode;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  stickyHeader?: boolean;
  className?: string;
  emptyState?: React.ReactNode;
}

// ── Alignment utility ────────────────────────────────────────────────────────
const ALIGN_CLASS: Record<string, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

// ── Component ────────────────────────────────────────────────────────────────
function AdminTable({
  columns,
  children,
  sortKey,
  sortDir,
  onSort,
  stickyHeader = false,
  className,
  emptyState,
}: AdminTableProps) {
  const isEmpty = React.Children.count(children) === 0;

  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full">
        <thead>
          <tr
            className={cn(
              "bg-gray-50 dark:bg-zinc-800/50",
              stickyHeader && "sticky top-0 z-10 bg-white dark:bg-zinc-900",
            )}
          >
            {columns.map((col) => {
              const isSorted = sortKey === col.key;
              const alignCls = ALIGN_CLASS[col.align ?? "left"];

              return (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-3 text-xs text-[var(--text-secondary)] dark:text-zinc-400 font-medium select-none",
                    alignCls,
                    col.width,
                    col.sortable && onSort && "cursor-pointer hover:text-[var(--text-primary)] dark:hover:text-zinc-200 transition-colors",
                  )}
                  onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
                >
                  <span className={cn(
                    "inline-flex items-center gap-1",
                    col.align === "right" && "flex-row-reverse",
                    col.align === "center" && "justify-center",
                  )}>
                    {col.label}
                    {col.sortable && onSort && (
                      <span className="inline-flex flex-col -space-y-1">
                        <ChevronUp
                          className={cn(
                            "h-3.5 w-3.5",
                            isSorted && sortDir === "asc"
                              ? "text-[var(--text-primary)]"
                              : "text-[var(--text-tertiary)] dark:text-zinc-600",
                          )}
                        />
                        <ChevronDown
                          className={cn(
                            "h-3.5 w-3.5",
                            isSorted && sortDir === "desc"
                              ? "text-[var(--text-primary)]"
                              : "text-[var(--text-tertiary)] dark:text-zinc-600",
                          )}
                        />
                      </span>
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-zinc-800">
          {isEmpty ? (
            <tr>
              <td colSpan={columns.length} className="py-12">
                {emptyState ?? (
                  <p className="text-center text-sm text-[var(--text-tertiary)] dark:text-zinc-500">
                    Sin datos disponibles
                  </p>
                )}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export { AdminTable };
export default React.memo(AdminTable);
