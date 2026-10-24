"use client";

/**
 * Conteo del efectivo final por billete y moneda: la cajera marca cuántos tiene
 * de cada uno y la app suma. Menos errores de tipeo y queda la composición.
 */
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import { calcularDesdeDenominaciones, DENOMINACIONES_PEN } from "./tipos";

type Props = {
  conteo: Record<string, number>;
  cambiar: (key: string, calcular: (actual: number) => number) => void;
};

export function ConteoDenominaciones({ conteo, cambiar }: Props) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
        {DENOMINACIONES_PEN.map((d) => {
          const key = String(d.valor);
          const count = conteo[key] || 0;
          const subtotal = d.valor * count;
          return (
            <div key={key} className="flex items-center gap-2 py-1.5 px-1 border-b border-[var(--rule-soft)] last:border-0">
              <span className={cn(
                "inline-flex items-center justify-center text-xs font-bold rounded-md px-2 py-0.5 w-16 shrink-0",
                d.tipo === "billete"
                  ? "bg-[var(--data-success-100)] dark:bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                  : "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15 text-[var(--text-primary)]",
              )}>
                {d.label}
              </span>
              <button
                type="button"
                onClick={() => cambiar(key, (n) => n - 1)}
                disabled={count === 0}
                className="h-8 w-8 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-30"
                aria-label={`Quitar ${d.label}`}
              >
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                min="0"
                value={count || ""}
                onChange={(e) => {
                  const raw = e.target.value;
                  const n = raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
                  cambiar(key, () => n);
                }}
                placeholder="0"
                aria-label={`Cantidad de ${d.label}`}
                className="w-12 h-8 px-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold text-center tabular-nums text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <button
                type="button"
                onClick={() => cambiar(key, (n) => n + 1)}
                className="h-8 w-8 rounded-lg border border-primary/40 bg-primary/10 text-base font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] hover:bg-primary/20"
                aria-label={`Agregar ${d.label}`}
              >
                +
              </button>
              <span className="ml-auto text-sm font-semibold text-[var(--text-secondary)] tabular-nums text-right">
                {subtotal > 0 ? formatCurrency(subtotal) : "—"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between items-center mt-3 pt-3 border-t border-[var(--rule-base)]">
        <span className="text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">Total contado</span>
        <span className="text-2xl font-extrabold text-[var(--text-primary)] tabular-nums">
          {formatCurrency(calcularDesdeDenominaciones(conteo))}
        </span>
      </div>
    </div>
  );
}
