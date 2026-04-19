/**
 * components/credit/CreditTransparencyBanner.tsx
 *
 * Fiado Digital Ola 2 — Phase 1 scaffold (UI customer-facing).
 *
 * Banner de "transparencia radical" del score, pensado para el marketplace
 * del cliente final. Ver US-F1-03 en `docs/fiado-digital-ola2-plan.md` §1:
 *
 *   "Como cliente, quiero ver mi propio score en el marketplace con una
 *    explicación clara de qué me sube y qué me baja, para mejorarlo a
 *    propósito."
 *
 * ### TODOs — dependencias TD-030
 *
 * - [ ] (TD-030) Abrir modal de explicación real con breakdown + tips
 *       cuando el backend devuelva el histórico completo.
 * - [ ] (TD-030) Mostrar delta contra mes pasado (requiere
 *       `CreditScoreHistory` para calcular el diff).
 */

"use client";

import { Info, TrendingUp } from "@buleje/design-system/icons";
import { useState } from "react";

// ─── Props ────────────────────────────────────────────────────────────────────

export type CreditTransparencyBannerProps = {
  /** Score actual del cliente 0–1000. */
  score: number;
  /** Razón corta legible del último cambio (ej: "Subió desde 580 el mes pasado"). */
  reason: string;
  /** Fecha estimada de la próxima revisión automática. */
  nextReviewDate?: Date;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateShort(date: Date): string {
  return new Intl.DateTimeFormat("es-PE", {
    day: "numeric",
    month: "long",
  }).format(date);
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function CreditTransparencyBanner({
  score,
  reason,
  nextReviewDate,
}: CreditTransparencyBannerProps) {
  const [showDetails, setShowDetails] = useState(false);
  const clampedScore = Math.min(1000, Math.max(0, score));

  return (
    <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100">
          <TrendingUp className="h-5 w-5 text-emerald-700" aria-hidden />
        </div>

        <div className="flex-1">
          <p className="text-sm text-slate-600">Tu score de crédito</p>
          <p className="text-2xl font-bold text-emerald-800">
            {clampedScore}
            <span className="ml-1 text-sm font-normal text-slate-400">/ 1000</span>
          </p>
          <p className="mt-1 text-sm text-slate-700">{reason}</p>

          {nextReviewDate && (
            <p className="mt-1 text-xs text-slate-500">
              Próxima revisión: {formatDateShort(nextReviewDate)}
            </p>
          )}

          <button
            type="button"
            onClick={() => setShowDetails((prev) => !prev)}
            className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:text-emerald-900 hover:underline"
            aria-expanded={showDetails}
          >
            <Info className="h-3.5 w-3.5" aria-hidden />
            ¿Cómo funciona mi score?
          </button>

          {showDetails && (
            <div className="mt-3 rounded-xl border border-dashed border-emerald-200 bg-white/60 p-3 text-xs text-slate-600">
              <p className="font-medium text-slate-700">
                Tu score se calcula con 5 factores:
              </p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                <li>Historial de compras (30%)</li>
                <li>Puntualidad de pagos (30%)</li>
                <li>Ticket promedio (15%)</li>
                <li>Antigüedad como cliente (15%)</li>
                <li>Puntos de lealtad (10%)</li>
              </ul>
              <p className="mt-2 text-[length:var(--ts-2xs)] text-slate-500">
                Pagar a tiempo sube tu score. La explicación detallada con
                tips personalizados estará disponible después de la migración
                TD-030.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
