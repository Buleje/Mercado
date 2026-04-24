"use client";

/**
 * DynamicPricingSuggestionsCard — IA sugiere ajustes de precio por:
 *   - FEFO (first expire, first out): producto vence en pocos dias
 *   - Demand surge: viernes de feriado, llueve, etc
 *   - Overstock: stock excede rotación promedio
 *   - Deadstock: cero ventas en X dias
 *
 * Cada sugerencia viene con:
 *   - productId, nombre, stock, precio actual
 *   - precio sugerido + % cambio
 *   - razon humana ("vence en 5 dias, -20% para vender")
 *   - impacto estimado (S/ perdido si no actua)
 *
 * Aplica con 1 click. No-regret: el bodeguero siempre puede deshacer.
 */

import { useState, useCallback } from "react";
import {
  Zap,
  Timer,
  AlertCircle,
  Check,
  TrendingDown,
  TrendingUp,
  Package,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export type SuggestionReason =
  | "fefo"
  | "demand-surge"
  | "overstock"
  | "deadstock"
  | "competition";

export interface PriceSuggestion {
  productId: string;
  name: string;
  currentStock: number;
  currentPrice: number;
  suggestedPrice: number;
  reason: SuggestionReason;
  /** Texto humano explicando el por qué */
  explanation: string;
  /** Valor estimado en riesgo si no actua (en soles) */
  atRisk?: number;
  /** Dias hasta vencimiento si FEFO */
  daysToExpire?: number;
}

interface Props {
  suggestions: PriceSuggestion[];
  onApply?: (productId: string, newPrice: number) => Promise<void> | void;
  onDismiss?: (productId: string) => void;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

const REASON_CONFIG: Record<SuggestionReason, { icon: typeof Timer; label: string; tone: "warn" | "accent" | "neutral" }> = {
  fefo: { icon: Timer, label: "Vence pronto", tone: "warn" },
  "demand-surge": { icon: TrendingUp, label: "Alta demanda", tone: "accent" },
  overstock: { icon: Package, label: "Sobrestock", tone: "warn" },
  deadstock: { icon: AlertCircle, label: "Sin rotación", tone: "warn" },
  competition: { icon: TrendingDown, label: "Ajuste competencia", tone: "neutral" },
};

export default function DynamicPricingSuggestionsCard({
  suggestions,
  onApply,
  onDismiss,
}: Props) {
  const [applying, setApplying] = useState<string | null>(null);
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = suggestions.filter(
    (s) => !dismissed.has(s.productId) && !applied.has(s.productId),
  );

  const handleApply = useCallback(
    async (sug: PriceSuggestion) => {
      setApplying(sug.productId);
      try {
        await onApply?.(sug.productId, sug.suggestedPrice);
        setApplied((prev) => new Set(prev).add(sug.productId));
      } finally {
        setApplying(null);
      }
    },
    [onApply],
  );

  const handleDismiss = useCallback(
    (sug: PriceSuggestion) => {
      setDismissed((prev) => new Set(prev).add(sug.productId));
      onDismiss?.(sug.productId);
    },
    [onDismiss],
  );

  const totalAtRisk = visible.reduce((sum, s) => sum + (s.atRisk ?? 0), 0);

  return (
    <section
      aria-label="Sugerencias de precios con IA"
      className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-4 sm:px-6 border-b border-[var(--rule-soft)]">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]">
            <Zap className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--accent)]">
              IA · Sugerencias de precio
            </p>
            <h3 className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
              {visible.length} oportunidades hoy
            </h3>
          </div>
        </div>
        {totalAtRisk > 0 && (
          <div className="mt-3 rounded-xl border border-[var(--data-warning,_#eab308)]/40 bg-[var(--data-warning,_#eab308)]/10 px-3 py-2 flex items-center gap-2">
            <AlertCircle
              className="h-4 w-4 text-[var(--data-warning,_#eab308)] shrink-0"
              strokeWidth={1.75}
              aria-hidden
            />
            <p className="text-xs text-[var(--text-secondary)]">
              Si no actuás, podrías perder{" "}
              <span className="font-extrabold text-[var(--text-primary)] tabular-nums">
                {fmt(totalAtRisk)}
              </span>{" "}
              esta semana
            </p>
          </div>
        )}
      </div>

      {/* Lista de sugerencias */}
      <ul className="divide-y divide-[var(--rule-soft)]">
        {visible.length === 0 && (
          <li className="px-5 sm:px-6 py-8 text-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] mb-3">
              <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
            </span>
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Todo en orden
            </p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              No hay ajustes urgentes por el momento
            </p>
          </li>
        )}
        {visible.map((sug) => {
          const config = REASON_CONFIG[sug.reason];
          const Icon = config.icon;
          const deltaPct =
            sug.currentPrice > 0
              ? ((sug.suggestedPrice - sug.currentPrice) / sug.currentPrice) * 100
              : 0;
          const direction = deltaPct < 0 ? "down" : "up";
          const toneClasses =
            config.tone === "warn"
              ? "bg-[var(--data-warning,_#eab308)]/10 text-[var(--data-warning,_#eab308)]"
              : config.tone === "accent"
              ? "bg-[var(--accent-soft)] text-[var(--accent)]"
              : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
          return (
            <li key={sug.productId} className="px-5 sm:px-6 py-4">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                    toneClasses,
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <p className="text-sm font-bold text-[var(--text-primary)] truncate">
                      {sug.name}
                    </p>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold shrink-0",
                        toneClasses,
                      )}
                    >
                      {config.label}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-2">
                    {sug.explanation}
                  </p>

                  {/* Precios */}
                  <div className="flex items-baseline gap-2 text-sm">
                    <span className="text-[var(--text-tertiary)] line-through tabular-nums">
                      {fmt(sug.currentPrice)}
                    </span>
                    <span className="text-[var(--text-tertiary)]">→</span>
                    <span className="text-base font-extrabold tabular-nums text-[var(--accent)]">
                      {fmt(sug.suggestedPrice)}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-bold tabular-nums",
                        direction === "down"
                          ? "text-[var(--data-error,_#e11d48)]"
                          : "text-[var(--data-success,_#00b66a)]",
                      )}
                    >
                      {direction === "down" ? (
                        <TrendingDown className="h-3 w-3" strokeWidth={2} aria-hidden />
                      ) : (
                        <TrendingUp className="h-3 w-3" strokeWidth={2} aria-hidden />
                      )}
                      {deltaPct > 0 ? "+" : ""}
                      {deltaPct.toFixed(0)}%
                    </span>
                  </div>

                  {/* Meta info */}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    <span>Stock: {sug.currentStock}</span>
                    {sug.daysToExpire !== undefined && (
                      <span>Vence en {sug.daysToExpire} días</span>
                    )}
                    {sug.atRisk !== undefined && sug.atRisk > 0 && (
                      <span className="font-bold text-[var(--data-warning,_#eab308)]">
                        Riesgo: {fmt(sug.atRisk)}
                      </span>
                    )}
                  </div>

                  {/* CTAs */}
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleApply(sug)}
                      disabled={applying === sug.productId}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] px-4 py-1.5 text-xs font-bold hover:bg-[var(--accent)] transition-colors active:scale-[0.98]",
                        applying === sug.productId && "opacity-50 cursor-wait",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                      {applying === sug.productId ? "Aplicando…" : "Aplicar precio"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismiss(sug)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)] px-4 py-1.5 text-xs font-bold hover:border-[var(--accent)]/40 transition-colors"
                    >
                      Ignorar
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {applied.size > 0 && (
        <div className="px-5 sm:px-6 py-3 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] text-center">
            <Check className="h-3 w-3 inline-block mr-1 text-[var(--accent)]" strokeWidth={2.5} />
            {applied.size} precio{applied.size === 1 ? "" : "s"} actualizado
            {applied.size === 1 ? "" : "s"} hoy
          </p>
        </div>
      )}
    </section>
  );
}
