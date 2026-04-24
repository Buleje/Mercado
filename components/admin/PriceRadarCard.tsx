"use client";

/**
 * PriceRadarCard — Widget para bodeguero que muestra cómo se comparan sus
 * precios vs el promedio del marketplace y vs la bodega más cercana.
 *
 * Para cada producto:
 *   - Precio actual de la bodega
 *   - Precio promedio del marketplace en esa categoría/producto
 *   - Sugerencia: subir / mantener / bajar
 *   - Delta vs promedio en %
 *
 * Permite al bodeguero tomar decisiones informadas. Sin chantaje ("tu
 * competencia X"), solo data comparativa.
 *
 * Props: productos con current/avg/min/max del marketplace.
 */

import { TrendingUp, TrendingDown, Minus, Target, ArrowRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface PriceComparison {
  productId: string;
  name: string;
  currentPrice: number;
  avgMarket: number;
  minMarket: number;
  maxMarket: number;
  /** Cuántos pedidos en últimos 30d para este producto en el marketplace */
  volume30d?: number;
}

interface Props {
  products: PriceComparison[];
  onAdjust?: (productId: string) => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

type Signal = "high" | "aligned" | "low";

function getSignal(comp: PriceComparison): { signal: Signal; deltaPct: number } {
  const delta = comp.currentPrice - comp.avgMarket;
  const deltaPct = comp.avgMarket > 0 ? (delta / comp.avgMarket) * 100 : 0;
  if (deltaPct > 7) return { signal: "high", deltaPct };
  if (deltaPct < -7) return { signal: "low", deltaPct };
  return { signal: "aligned", deltaPct };
}

function signalLabel(signal: Signal): { label: string; hint: string } {
  switch (signal) {
    case "high":
      return {
        label: "Arriba del promedio",
        hint: "Clientes quizás elijan otra bodega. Considerá bajar.",
      };
    case "low":
      return {
        label: "Abajo del promedio",
        hint: "Podés subir sin perder ventas. Margen extra.",
      };
    case "aligned":
      return {
        label: "En promedio",
        hint: "Tu precio está alineado con el mercado.",
      };
  }
}

export default function PriceRadarCard({ products, onAdjust }: Props) {
  const highCount = products.filter((p) => getSignal(p).signal === "high").length;
  const lowCount = products.filter((p) => getSignal(p).signal === "low").length;
  const alignedCount = products.length - highCount - lowCount;

  return (
    <section
      aria-label="Radar de precios"
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 sm:px-6 border-b border-[var(--rule-soft)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Target className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Radar de precios
            </p>
            <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              ¿Cómo estás vs el mercado?
            </h3>
          </div>
        </div>
      </div>

      {/* Summary chips */}
      <div className="px-5 sm:px-6 py-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-[var(--data-error,_#e11d48)]/30 bg-[var(--data-error,_#e11d48)]/5 p-3 text-center">
          <p className="text-lg font-extrabold tabular-nums text-[var(--data-error,_#e11d48)]">
            {highCount}
          </p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
            Arriba promedio
          </p>
        </div>
        <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-3 text-center">
          <p className="text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
            {alignedCount}
          </p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
            Alineados
          </p>
        </div>
        <div className="rounded-xl border border-[var(--data-success,_#00b66a)]/30 bg-[var(--data-success,_#00b66a)]/5 p-3 text-center">
          <p className="text-lg font-extrabold tabular-nums text-[var(--data-success,_#00b66a)]">
            {lowCount}
          </p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
            Margen extra
          </p>
        </div>
      </div>

      {/* Lista de productos */}
      <ul className="divide-y divide-[var(--rule-soft)]">
        {products.length === 0 && (
          <li className="px-5 sm:px-6 py-8 text-center">
            <p className="text-sm text-[var(--text-tertiary)]">
              Sin datos comparativos todavía. Publicá más productos.
            </p>
          </li>
        )}
        {products.map((p) => {
          const { signal, deltaPct } = getSignal(p);
          const { label, hint } = signalLabel(signal);
          const Icon = signal === "high" ? TrendingUp : signal === "low" ? TrendingDown : Minus;
          const color =
            signal === "high"
              ? "text-[var(--data-error,_#e11d48)]"
              : signal === "low"
              ? "text-[var(--data-success,_#00b66a)]"
              : "text-[var(--text-tertiary)]";
          return (
            <li
              key={p.productId}
              className="px-5 sm:px-6 py-4 hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                    signal === "high"
                      ? "bg-[var(--data-error,_#e11d48)]/10"
                      : signal === "low"
                      ? "bg-[var(--data-success,_#00b66a)]/10"
                      : "bg-[var(--surface-sunken)]",
                  )}
                >
                  <Icon className={cn("h-4 w-4", color)} strokeWidth={2} aria-hidden />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {p.name}
                    </p>
                    <p
                      className={cn(
                        "text-[length:var(--ts-2xs)] font-bold tabular-nums shrink-0",
                        color,
                      )}
                    >
                      {deltaPct > 0 ? "+" : ""}
                      {deltaPct.toFixed(0)}%
                    </p>
                  </div>
                  <div className="mt-1 flex items-baseline gap-3 text-xs">
                    <span className="tabular-nums">
                      <span className="text-[var(--text-tertiary)]">Tu precio: </span>
                      <span className="font-bold text-[var(--text-primary)]">
                        {fmt(p.currentPrice)}
                      </span>
                    </span>
                    <span className="tabular-nums">
                      <span className="text-[var(--text-tertiary)]">Mercado: </span>
                      <span className="font-bold text-[var(--text-secondary)]">
                        {fmt(p.avgMarket)}
                      </span>
                    </span>
                  </div>
                  {p.volume30d !== undefined && p.volume30d > 0 && (
                    <p className="mt-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      {p.volume30d} ventas en el marketplace (30d)
                    </p>
                  )}
                  <p className={cn("mt-1 text-xs font-medium", color)}>{label}</p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5 leading-relaxed">
                    {hint}
                  </p>
                  {onAdjust && signal !== "aligned" && (
                    <button
                      type="button"
                      onClick={() => onAdjust(p.productId)}
                      className="mt-2 inline-flex items-center gap-1 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)] hover:gap-2 transition-all"
                    >
                      Ajustar precio
                      <ArrowRight className="h-3 w-3" strokeWidth={2} aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
