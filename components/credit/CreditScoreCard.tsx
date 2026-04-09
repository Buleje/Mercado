/**
 * components/credit/CreditScoreCard.tsx
 *
 * Fiado Digital Ola 2 — Phase 1 scaffold (UI admin-facing).
 *
 * Muestra el score actual del cliente con:
 *   - Barra de progreso visual (0–1000)
 *   - Tier (bronze / silver / gold / platinum) con color y emoji
 *   - Crédito disponible vs usado
 *   - Placeholder para mini-chart del historial (pendiente de TD-030)
 *
 * Ver US-F1-02 en `docs/fiado-digital-ola2-plan.md` §1.
 *
 * ### TODOs — dependencias TD-030
 *
 * - [ ] (TD-030) Consumir GET /api/credit/score-history/[customerId] y
 *       renderizar mini-chart con los últimos 12 snapshots.
 * - [ ] (TD-030) Mostrar delta vs mes pasado cuando haya datos reales.
 */

"use client";

import { TrendingUp, Wallet, Shield, Sparkles } from "lucide-react";

// ─── Props + tipos ────────────────────────────────────────────────────────────

export type CreditScoreCardProps = {
  customerId: string;
  /** Score actual del cliente, 0–1000. */
  currentScore: number;
  /** Límite total de crédito en PEN. */
  limit: number;
  /** Monto actualmente usado en PEN. */
  used: number;
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
}: CreditScoreCardProps) {
  const clampedScore = Math.min(1000, Math.max(0, currentScore));
  const tier = getTier(clampedScore);
  const scorePercent = (clampedScore / 1000) * 100;

  const available = Math.max(0, limit - used);
  const usedPercent = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;

  return (
    <div
      className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      data-customer-id={customerId}
    >
      {/* Header: tier badge + score number */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Shield className="h-4 w-4" aria-hidden />
            <span>Score de crédito</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-4xl font-bold ${tier.textClass}`}>
              {clampedScore}
            </span>
            <span className="text-sm text-slate-400">/ 1000</span>
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
          className="h-3 w-full overflow-hidden rounded-full bg-slate-100"
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
        <div className="rounded-xl bg-emerald-50 p-3">
          <div className="flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Wallet className="h-3.5 w-3.5" aria-hidden />
            Disponible
          </div>
          <div className="mt-1 text-xl font-bold text-emerald-700">
            {formatPEN(available)}
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="flex items-center gap-1 text-xs font-medium text-slate-600">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            En uso
          </div>
          <div className="mt-1 text-xl font-bold text-slate-700">
            {formatPEN(used)}
          </div>
        </div>
      </div>

      {/* Barra de uso */}
      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>Uso actual</span>
          <span>
            {formatPEN(used)} / {formatPEN(limit)}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-slate-400 transition-all duration-500"
            style={{ width: `${usedPercent}%` }}
          />
        </div>
      </div>

      {/* Placeholder historial — stub hasta TD-030 */}
      <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          <span className="font-medium">Historial de score</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          El timeline de evolución estará disponible una vez aplicada la
          migración TD-030 (tabla <code>CreditScoreHistory</code>).
        </p>
      </div>
    </div>
  );
}
