/**
 * components/credit/CreditScoreCard.tsx
 *
 * Fiado Digital Phase 1 — Score card para admin y portal cliente.
 *
 * Muestra:
 *   - Barra de progreso visual (0–1000) con tier (bronze/silver/gold/platinum)
 *   - Crédito disponible vs usado
 *   - Mini-chart de evolución del score (últimos 12 snapshots) cuando se pasa `history`
 *
 * Ver US-F1-02 en `docs/fiado-digital-ola2-plan.md` §1.
 */

"use client";

import { TrendingUp, Wallet, Shield } from "lucide-react";

// ─── Props + tipos ────────────────────────────────────────────────────────────

export type CreditScoreCardProps = {
  customerId: string;
  /** Score actual del cliente, 0–1000. */
  currentScore: number;
  /** Límite total de crédito en PEN. */
  limit: number;
  /** Monto actualmente usado en PEN. */
  used: number;
  /**
   * Historial de score (últimos snapshots) para mini-chart de evolución.
   * Cada elemento tiene score 0-1000 y fecha ISO. Opcional.
   */
  history?: Array<{ score: number; date: string }>;
};

type Tier = {
  name: string;
  emoji: string;
  barClass: string;
  badgeClass: string;
  textClass: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTier(score: number): Tier {
  if (score >= 900) {
    return {
      name: "Platinum",
      emoji: "💎",
      barClass: "bg-gradient-to-r from-cyan-400 to-indigo-500",
      badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200",
      textClass: "text-indigo-700",
    };
  }
  if (score >= 700) {
    return {
      name: "Gold",
      emoji: "🥇",
      barClass: "bg-gradient-to-r from-yellow-400 to-amber-500",
      badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
      textClass: "text-amber-700",
    };
  }
  if (score >= 500) {
    return {
      name: "Silver",
      emoji: "🥈",
      barClass: "bg-gradient-to-r from-slate-300 to-slate-500",
      badgeClass: "bg-slate-50 text-slate-700 border-slate-200",
      textClass: "text-slate-700",
    };
  }
  if (score >= 300) {
    return {
      name: "Bronze",
      emoji: "🥉",
      barClass: "bg-gradient-to-r from-orange-400 to-orange-600",
      badgeClass: "bg-orange-50 text-orange-700 border-orange-200",
      textClass: "text-orange-700",
    };
  }
  return {
    name: "Sin crédito",
    emoji: "🔒",
    barClass: "bg-gradient-to-r from-red-400 to-red-600",
    badgeClass: "bg-red-50 text-red-700 border-red-200",
    textClass: "text-red-700",
  };
}

function formatPEN(amount: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function CreditScoreCard({
  customerId,
  currentScore,
  limit,
  used,
  history,
}: CreditScoreCardProps) {
  const clampedScore = Math.min(1000, Math.max(0, currentScore));
  const tier = getTier(clampedScore);
  const scorePercent = (clampedScore / 1000) * 100;

  const available = Math.max(0, limit - used);
  const usedPercent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800"
      data-customer-id={customerId}
    >
      {/* Header: tier badge + score number */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Shield className="h-4 w-4" aria-hidden />
            <span>Score de crédito</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-4xl font-bold ${tier.textClass}`}>
              {clampedScore}
            </span>
            <span className="text-sm text-slate-400 dark:text-slate-500">/ 1000</span>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold ${tier.badgeClass}`}
        >
          <span aria-hidden>{tier.emoji}</span>
          {tier.name}
        </span>
      </div>

      {/* Progress bar 0-1000 */}
      <div className="mt-4">
        <div
          className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700"
          role="progressbar"
          aria-valuenow={clampedScore}
          aria-valuemin={0}
          aria-valuemax={1000}
          aria-label={`Score ${clampedScore} de 1000`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ${tier.barClass}`}
            style={{ width: `${scorePercent}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-slate-400">
          <span>0</span>
          <span>300</span>
          <span>500</span>
          <span>700</span>
          <span>900</span>
          <span>1000</span>
        </div>
      </div>

      {/* Disponible vs usado */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-900/20">
          <div className="flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            Disponible
          </div>
          <div className="mt-1 text-xl font-bold text-emerald-700 dark:text-emerald-400">
            {formatPEN(available)}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-700/50">
          <div className="flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            En uso
          </div>
          <div className="mt-1 text-xl font-bold text-slate-700 dark:text-slate-200">
            {formatPEN(used)}
          </div>
        </div>
      </div>

      {/* Barra de uso */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>Uso actual</span>
          <span>
            {formatPEN(used)} / {formatPEN(limit)}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
          <div
            className="h-full rounded-full bg-slate-400 transition-all duration-500 dark:bg-slate-500"
            style={{ width: `${usedPercent}%` }}
          />
        </div>
      </div>

      {/* Mini-chart de evolución del score — se muestra si hay historial */}
      {history && history.length >= 2 && (
        <div className="mt-5">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Evolución
          </p>
          <MiniScoreChart history={history} />
        </div>
      )}
    </div>
  );
}

// ── Mini-chart de barras para historial de score ──────────────────────────────

function MiniScoreChart({
  history,
}: {
  history: Array<{ score: number; date: string }>;
}) {
  const maxScore = Math.max(...history.map((h) => h.score), 1);

  return (
    <div
      className="flex h-10 items-end gap-0.5"
      role="img"
      aria-label={`Evolución del score: ${history.map((h) => h.score).join(", ")}`}
    >
      {history.map((h, i) => {
        const pct = Math.max(8, (h.score / maxScore) * 100);
        const isLast = i === history.length - 1;
        const barColor = isLast
          ? "bg-emerald-500"
          : h.score >= 700
            ? "bg-emerald-300"
            : h.score >= 400
              ? "bg-amber-300"
              : "bg-red-300";

        return (
          <div
            key={i}
            title={`${h.score} — ${new Date(h.date).toLocaleDateString("es-PE", { day: "numeric", month: "short" })}`}
            className={`flex-1 rounded-sm transition-all duration-300 ${barColor} ${isLast ? "opacity-100" : "opacity-70"}`}
            style={{ height: `${pct}%` }}
          />
        );
      })}
    </div>
  );
}
