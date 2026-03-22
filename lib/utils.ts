import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Export an array of objects as a CSV file download */
export function exportToCSV(
  rows: Record<string, string | number | boolean | null | undefined>[],
  filename: string,
) {
  if (rows.length === 0) return;
  const keys = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const csv =
    keys.map(escape).join(",") +
    "\n" +
    rows.map((r) => keys.map((k) => escape(r[k])).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Formatters ──────────────────────────────────────────────────────────────
// Single source of truth — import from "@/lib/utils" in all admin tabs.

/**
 * Format a number as Peruvian Soles.
 * @example formatCurrency(1234.5) → "S/ 1,234.50"
 */
export function formatCurrency(amount: number): string {
  return `S/ ${amount.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format an ISO date string to a readable date in es-PE locale.
 * @example formatDate("2024-03-15T00:00:00Z") → "15 mar. 2024"
 */
export function formatDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format an ISO datetime string to date + time in es-PE locale.
 * @example formatDateTime("2024-03-15T14:30:00Z") → "15 mar. 2024, 14:30"
 */
export function formatDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

