"use client";

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

import type { MeteringSnapshot } from "@/components/admin/unified/MeteringCard/types";
import {
  computeTrafficLight,
  computePercentage,
  EVENT_LABELS,
  PLAN_LABELS,
} from "@/components/admin/unified/MeteringCard/types";
import { METERED_EVENTS } from "@/lib/billing/metering";
import type { MeteredEvent } from "@/lib/billing/metering";
import { formatDate, formatDateShort, formatNumber } from "@/lib/format";
import AdminModal from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface QuotaAlertModalProps {
  snapshot: MeteringSnapshot;
  onClose: () => void;
  upgradeHref?: string;
}

// ─── Colores por semáforo ─────────────────────────────────────────────────────

const BAR_COLORS = {
  green:  "bg-primary/10 dark:bg-primary/10",
  yellow: "bg-[var(--data-warning-500)]   dark:bg-[var(--data-warning-500)]",
  red:    "bg-[var(--data-error-500)]     dark:bg-[var(--data-error-500)]",
} as const;

const TEXT_COLORS = {
  green:  "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
  yellow: "text-[var(--data-warning-700)]   dark:text-[var(--data-warning-500)]",
  red:    "text-[var(--data-error-700)]     dark:text-[var(--data-error-500)]",
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
            ? "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:bg-primary/15 dark:text-[var(--data-success-500)]"
            : light === "yellow"
              ? "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]"
              : "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]"
        }`}>
          {STATUS_LABELS[light]}
        </span>
      </div>

      <div
        className="h-2 w-full rounded-full bg-[var(--rule-base)] overflow-hidden"
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
          {formatNumber(used)} usados
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">
          {limit === Infinity ? "Sin límite" : `Límite: ${formatNumber(limit)}`}
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
  const showUpgrade = snapshot.plan === "free" || snapshot.plan === "starter";

  return (
    <AdminModal
      open
      onClose={onClose}
      title="Uso de cuota — detalles"
      description={`Plan ${PLAN_LABELS[snapshot.plan]} · Período: ${formatDateShort(snapshot.period.from)} – ${formatDate(snapshot.period.to)}`}
      size="md"
      claveVentana="cuota-detalle"
      footer={
        <ModalFooter
          nota={
            <>
              Costo estimado del período:{" "}
              <strong className="text-[var(--text-primary)]">USD {Number(snapshot.estimatedCostUsd).toFixed(2)}</strong>
            </>
          }
        >
          <button type="button" onClick={onClose} className={button({ variant: "secondary" })}>
            Cerrar
          </button>
          {showUpgrade && (
            <a href={upgradeHref} className={button({ variant: "primary" })} aria-label="Mejorar plan de facturación">
              Mejorar plan
            </a>
          )}
        </ModalFooter>
      }
    >
      <div className="px-5 py-2 sm:px-6">
        <ul className="divide-y divide-[var(--rule-soft)]" aria-label="Lista de métricas de uso">
          {METERED_EVENTS.map((event) => (
            <MetricRow key={event} event={event} snapshot={snapshot} />
          ))}
        </ul>
      </div>
    </AdminModal>
  );
}

export default QuotaAlertModal;
