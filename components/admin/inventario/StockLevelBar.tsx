"use client";

/**
 * StockLevelBar — barra visual de stock (Brandon 2026-06-06). Extraído de
 * InventoryTab.tsx (2026-06-13, descomposición del mega-componente). Reemplaza
 * el número plano de la columna Stock por una barra de nivel con color por
 * estado + marcador del mínimo; se reusa como preview en vivo en los modales
 * de agregar/editar. Un vistazo y sabés cuánto queda y si urge.
 */

import { AlertTriangle, RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type StockState = "none" | "out" | "critical" | "low" | "ok" | "over";

export function stockStateOf(stock: number | undefined, min: number, max: number): StockState {
  if (stock === undefined) return "none";
  if (stock === 0) return "out";
  if (stock <= min) return "critical";
  if (stock <= min * 2) return "low";
  if (max > 0 && stock > max) return "over";
  return "ok";
}

const STOCK_META: Record<StockState, { label: string; bar: string; text: string; chip: string }> = {
  none:     { label: "Sin control",  bar: "bg-[var(--rule-base)]",        text: "text-[var(--text-tertiary)]", chip: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]" },
  out:      { label: "Agotado",      bar: "bg-[var(--data-error-500)]",   text: "text-[var(--data-error-500)]", chip: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/30" },
  critical: { label: "Crítico",      bar: "bg-[var(--data-error-500)]",   text: "text-[var(--data-error-500)]", chip: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-red-950/30" },
  low:      { label: "Bajo",         bar: "bg-[var(--data-warning-500)]", text: "text-[var(--data-warning-500)]", chip: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-amber-950/30" },
  ok:       { label: "Saludable",    bar: "bg-[var(--data-success-500)]", text: "text-[var(--data-success-500)]", chip: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/20 dark:text-[var(--data-success-500)]" },
  over:     { label: "Exceso",       bar: "bg-[var(--accent)]",           text: "text-[var(--accent)]",        chip: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" },
};

export function StockLevelBar({
  stock, stockMin, stockMax, unit, variant = "cell",
}: {
  stock: number | null | undefined;
  stockMin?: number | null;
  stockMax?: number | null;
  unit?: string | null;
  variant?: "cell" | "full" | "compact";
}) {
  if (stock === undefined || stock === null) {
    // Stock ilimitado / no controla inventario (comida al pedido, servicio).
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-bold text-[var(--text-tertiary)]" title="Stock ilimitado — se prepara o repone al pedido">
        <RefreshCw className="h-3 w-3" />
        Ilimitado
      </span>
    );
  }

  const min = stockMin ?? 5;
  // Escala de la barra: el máximo configurado o, si no hay, el doble del mínimo.
  const scaleMax = Math.max(stockMax ?? 0, min * 2, stock, 1);
  const state = stockStateOf(stock, min, stockMax ?? 0);
  const meta = STOCK_META[state];
  const pct = Math.min((stock / scaleMax) * 100, 100);
  const minPct = Math.min((min / scaleMax) * 100, 100);

  if (variant === "full") {
    return (
      <div className="rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-1">
            <span className={cn("text-2xl font-black tabular-nums leading-none", meta.text)}>{stock}</span>
            {unit && <span className="text-xs font-semibold text-[var(--text-tertiary)]">{unit}</span>}
          </span>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider", meta.chip)}>
            {(state === "out" || state === "critical" || state === "low") && <AlertTriangle className="h-3 w-3" />}
            {meta.label}
          </span>
        </div>
        <div className="relative mt-2 h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-raised)] ring-1 ring-[var(--rule-soft)]">
          <div className={cn("h-full rounded-full transition-[width] duration-300", meta.bar)} style={{ width: `${pct}%` }} />
          {/* Marcador del mínimo */}
          <span className="absolute top-0 bottom-0 w-px bg-[var(--text-primary)]/40" style={{ left: `${minPct}%` }} aria-hidden />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] tabular-nums">
          <span>Mín {min}</span>
          {stockMax != null && stockMax > 0 && <span>Máx {stockMax}</span>}
        </div>
      </div>
    );
  }

  // variant "compact" — para la card: ligero (sin caja pesada), número
  // moderado, etiqueta "Stock" para que el NOMBRE del producto siga mandando.
  if (variant === "compact") {
    return (
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Stock</span>
          <span className="flex items-baseline gap-1.5">
            <span className={cn("text-base font-black tabular-nums leading-none", meta.text)}>{stock}</span>
            {unit && <span className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">{unit}</span>}
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider", meta.chip)}>
              {(state === "out" || state === "critical" || state === "low") && <AlertTriangle className="h-3 w-3" />}
              {meta.label}
            </span>
          </span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)] ring-1 ring-[var(--rule-soft)]">
          <div className={cn("h-full rounded-full transition-[width] duration-300", meta.bar)} style={{ width: `${pct}%` }} />
          <span className="absolute top-0 bottom-0 w-px bg-[var(--text-primary)]/40" style={{ left: `${minPct}%` }} aria-hidden />
        </div>
        <div className="mt-1 flex items-center justify-between text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] tabular-nums">
          <span>Mín {min}</span>
          {stockMax != null && stockMax > 0 && <span>Máx {stockMax}</span>}
        </div>
      </div>
    );
  }

  // variant "cell" — compacto para la tabla
  return (
    <div className="flex w-[112px] max-w-full items-center gap-2" title={`${meta.label} · stock ${stock} (mín ${min}${stockMax ? ` · máx ${stockMax}` : ""})`}>
      <span className={cn("inline-flex min-w-[2.25rem] justify-center rounded-md px-1.5 py-0.5 text-xs font-black tabular-nums", meta.chip)}>
        {(state === "out" || state === "critical") && <AlertTriangle className="mr-0.5 h-3 w-3" />}
        {stock}
      </span>
      <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <span className={cn("absolute inset-y-0 left-0 rounded-full", meta.bar)} style={{ width: `${pct}%` }} />
        <span className="absolute inset-y-0 w-px bg-[var(--text-primary)]/35" style={{ left: `${minPct}%` }} aria-hidden />
      </span>
    </div>
  );
}
