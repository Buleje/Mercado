import type { ReactNode } from "react";
import { formatCurrency, formatNumber } from "@/lib/format";

export const soles = (n: number) => formatCurrency(n);
export const pct = (n: number) => `${formatNumber(n, 1)}%`;

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}

/** La barrita de margen: verde si gana, roja si pierde, ancho relativo al mayor. */
export function BarraMargen({ margen, maxAbs, minimo = 4 }: { margen: number; maxAbs: number; minimo?: number }) {
  return (
    <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-sunken)] sm:block" aria-hidden>
      <span
        className={`block h-full ${margen >= 0 ? "bg-[var(--data-success-500)]" : "bg-[var(--data-error-500)]"}`}
        style={{ width: `${Math.max(minimo, (Math.abs(margen) / maxAbs) * 100)}%` }}
      />
    </span>
  );
}
