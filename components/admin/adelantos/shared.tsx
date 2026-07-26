"use client";

/**
 * shared.tsx — helpers reutilizables del módulo Adelantos (ADR-117/118/121).
 * Extraídos de AdelantosModule.tsx para que AnalisisView (y otras vistas)
 * los compartan sin duplicar lógica de moneda ni estados vacíos.
 */

import type { ComponentType } from "react";
import { formatCurrency } from "@/lib/currency";

/** Formatea un monto en su moneda (USD con "$ ", resto vía formatCurrency = S/). */
export function fmtMon(n: number, moneda?: string | null): string {
  if (moneda === "USD") return `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return formatCurrency(n);
}

/** Suma montos agrupados por moneda → { PEN: x, USD: y }. */
export function sumByMoneda(items: { monto: number; moneda?: string | null }[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const it of items) { const cur = it.moneda || "PEN"; acc[cur] = (acc[cur] ?? 0) + it.monto; }
  return acc;
}

/** Renderiza un mapa de montos por moneda → "S/ X · $ Y" (solo monedas presentes). */
export function fmtMonedas(map: Record<string, number>): string {
  const keys = Object.keys(map).filter((k) => map[k] !== 0);
  if (keys.length === 0) return formatCurrency(0);
  return keys.map((k) => fmtMon(map[k], k)).join(" · ");
}

export function EmptyState({ icon: Icon, title, hint }: { icon: ComponentType<{ className?: string }>; title: string; hint: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-10 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] mb-3"><Icon className="h-6 w-6" /></div>
      <p className="text-base font-extrabold text-[var(--text-primary)]">{title}</p>
      <p className="text-base text-[var(--text-secondary)] mt-1">{hint}</p>
    </div>
  );
}

export function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-28 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] animate-pulse" />
      ))}
    </div>
  );
}
