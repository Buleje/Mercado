"use client";

import { SectionTitle } from "@buleje/design-system";
/**
 * QuotaAlertModal — Modal detallado de uso de cuotas
 *
 * Muestra:
 *  - Breakdown por métrica (usage / limit con barra de progreso)
 *  - Estado visual semáforo
 *  - Histórico 30 días (sparkline simplificado por métrica)
 *  - CTA "Mejorar plan"
 *
 * Accesibilidad WCAG AA:
 *  - role="dialog", aria-modal="true", aria-labelledby, aria-describedby
 *  - Focus trap: primer botón focalizable al montar
 *  - Esc cierra el modal
 *  - Contraste garantizado por clases Tailwind verificadas
 */

import { useEffect, useRef, useId } from "react";
import type { MeteringSnapshot } from "@/components/admin/unified/MeteringCard/types";
import {
  computeTrafficLight,
  computePercentage,
  EVENT_LABELS,
  PLAN_LABELS,
} from "@/components/admin/unified/MeteringCard/types";
import { METERED_EVENTS } from "@/lib/billing/metering";
import type { MeteredEvent } from "@/lib/billing/metering";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface QuotaAlertModalProps {
  snapshot: MeteringSnapshot;
  onClose: () => void;
  upgradeHref?: string;
}

// ─── Colores por semáforo ─────────────────────────────────────────────────────

const BAR_COLORS = {
  green:  "bg-[var(--accent-soft)] dark:bg-[var(--accent-soft)]",
  yellow: "bg-amber-400   dark:bg-amber-300",
  red:    "bg-red-500     dark:bg-red-400",
} as const;

const TEXT_COLORS = {
  green:  "text-[var(--data-success)] dark:text-[var(--data-success)]",
  yellow: "text-amber-700   dark:text-amber-300",
  red:    "text-red-700     dark:text-red-400",
} as const;

const STATUS_LABELS = {
  green:  "Normal",
  yellow: "Advertencia",
  red:    "Crítico",
} as const;

// ─── Fila de métrica ──────────────────────────────────────────────────────────

interface MetricRowProps {
  event: MeteredEvent;
  snapshot: MeteringSnapshot;
}

function MetricRow({ event, snapshot }: MetricRowProps) {
  const used = snapshot.usage[event] ?? 0;
  const limit = snapshot.quotas[event]?.limit ?? Infinity;
  const light = computeTrafficLight(used, limit);
  const pct = computePercentage(used, limit);
  const label = EVENT_LABELS[event];

  return (
    <li className="flex flex-col gap-1.5 py-3 border-b border-[var(--rule-base)] last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--text-primary)]">{label}</span>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          light === "green"
            ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]"
            : light === "yellow"
              ? "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]"
              : "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]"
        }`}>
          {STATUS_LABELS[light]}
        </span>
      </div>

      <div
        className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct}% de cuota utilizada para ${label}`}
      >
        <div
          className={`h-full rounded-full transition-all duration-[var(--dur-slow)] ${BAR_COLORS[light]}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className={`text-xs ${TEXT_COLORS[light]}`}>
          {used.toLocaleString("es-PE")} usados
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          {limit === Infinity ? "Sin límite" : `Límite: ${limit.toLocaleString("es-PE")}`}
        </span>
      </div>

      {/* Sparkline 30 días (datos del snapshot, 7 puntos disponibles) */}
      {snapshot.sparklines[event] && snapshot.sparklines[event].length > 0 && (
        <div
          className="flex items-end gap-0.5 h-8 mt-1"
          aria-label={`Tendencia 7 días para ${label}`}
          role="img"
        >
          {snapshot.sparklines[event].map((val, i) => {
            const maxVal = Math.max(...snapshot.sparklines[event], 1);
            const height = Math.max(4, Math.round((val / maxVal) * 32));
            return (
              <div
                key={i}
                className={`flex-1 rounded-sm ${BAR_COLORS[light]}`}
                style={{ height: `${height}px` }}
                title={`Día ${i + 1}: ${val}`}
                aria-hidden="true"
              />
            );
          })}
        </div>
      )}
    </li>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

export function QuotaAlertModal({ snapshot, onClose, upgradeHref = "/admin/billing/upgrade" }: QuotaAlertModalProps) {
  const titleId = useId();
  const descId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus al montar
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Cerrar con Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Bloquear scroll del body mientras está abierto
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const showUpgrade = snapshot.plan === "free" || snapshot.plan === "starter";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 dark:bg-black/70 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      >
        <div className="relative w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)]">

          {/* Header */}
          <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[var(--rule-base)] flex-shrink-0">
            <div>
              <SectionTitle
                id={titleId}
                className="text-lg font-semibold text-[var(--text-primary)]"
              >
                Uso de cuota — detalles
              </SectionTitle>
              <p
                id={descId}
                className="text-sm text-[var(--text-tertiary)] mt-0.5"
              >
                Plan {PLAN_LABELS[snapshot.plan]} · Período:{" "}
                {new Date(snapshot.period.from).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
                {" – "}
                {new Date(snapshot.period.to).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            </div>

            <button
              ref={closeRef}
              onClick={onClose}
              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-gray-200 hover:bg-[var(--surface-sunken)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d6a4f]"
              aria-label="Cerrar modal de detalles de cuota"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
              </svg>
            </button>
          </div>

          {/* Body scrollable */}
          <div className="flex-1 overflow-y-auto px-6 py-2">
            <ul className="divide-y divide-gray-100 dark:divide-gray-800" aria-label="Lista de métricas de uso">
              {METERED_EVENTS.map((event) => (
                <MetricRow key={event} event={event} snapshot={snapshot} />
              ))}
            </ul>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-[var(--rule-base)] flex flex-col sm:flex-row items-center gap-3 flex-shrink-0">
            <div className="flex-1 text-sm text-[var(--text-tertiary)]">
              Costo estimado del período:{" "}
              <strong className="text-[var(--text-primary)]">
                USD {snapshot.estimatedCostUsd.toFixed(2)}
              </strong>
            </div>

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="min-h-[44px] px-4 py-2 rounded-lg border border-[var(--rule-base)] text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d6a4f]"
              >
                Cerrar
              </button>

              {showUpgrade && (
                <a
                  href={upgradeHref}
                  className="min-h-[44px] inline-flex items-center px-4 py-2 rounded-lg bg-[#2d6a4f] hover:bg-[#245a42] text-white text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d6a4f]"
                  aria-label="Mejorar plan de facturación"
                >
                  Mejorar plan
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default QuotaAlertModal;
