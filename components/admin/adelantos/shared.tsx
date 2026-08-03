"use client";

/**
 * shared.tsx — helpers reutilizables del módulo Adelantos (ADR-117/118/121).
 * Extraídos de AdelantosModule.tsx para que AnalisisView (y otras vistas)
 * los compartan sin duplicar lógica de moneda ni estados vacíos.
 */

import type { ComponentType, ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { X } from "@buleje/design-system/icons";
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

// ── Primitivos de modal ───────────────────────────────────────────────────────
// Movidos desde AdelantosModule para que el modal de alta pueda vivir en su
// propio archivo sin importar el módulo entero (sería circular).

export const inputCls =
  "w-full h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-semibold text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-colors";

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
      {children}
    </label>
  );
}

export function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto rounded-2xl bg-[var(--surface-raised)] p-6 shadow-[var(--shadow-xl)]`}>
        <div className="flex items-center justify-between mb-4">
          <CardTitle className="text-lg font-extrabold text-[var(--text-primary)]">{title}</CardTitle>
          <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}

export function ModalActions({ onClose, onSubmit, saving, label }: { onClose: () => void; onSubmit: () => void; saving: boolean; label: string }) {
  return (
    <div className="flex gap-2 pt-2">
      <button onClick={onClose} className="flex-1 h-12 rounded-2xl border-2 border-[var(--rule-base)] text-base font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]">Cancelar</button>
      <button onClick={onSubmit} disabled={saving} className="flex-1 h-12 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary-dark disabled:opacity-50">{saving ? "Guardando…" : label}</button>
    </div>
  );
}

export function MiniStat({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "success" | "warning" }) {
  const color = tone === "success" ? "text-[var(--data-success)]" : tone === "warning" ? "text-[var(--data-warning)]" : "text-[var(--text-primary)]";
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] p-3 text-center">
      <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

