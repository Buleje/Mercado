"use client";

/**
 * QuotaAlertBanner — banner sticky de alerta de cuota
 *
 * Aparece automáticamente cuando alguna métrica alcanza ≥70% del quota.
 * - Amarillo (warning) a partir del 70%
 * - Rojo (critical) a partir del 90%
 * Accesibilidad: aria-live="polite" / "assertive" según severidad, role="alert".
 * Touch target: mín. 44x44px en todos los botones (regla mobile).
 */

import { useState, useCallback, useId } from "react";
import type { MeteringSnapshot } from "@/components/admin/unified/MeteringCard/types";
import {
  computeTrafficLight,
  EVENT_LABELS,
} from "@/components/admin/unified/MeteringCard/types";
import type { MeteredEvent } from "@/lib/billing/metering";
import { METERED_EVENTS } from "@/lib/billing/metering";
import { QuotaAlertModal } from "./QuotaAlertModal";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type AlertSeverity = "warning" | "critical" | "none";

export interface QuotaAlertBannerProps {
  snapshot: MeteringSnapshot;
  /** URL destino del CTA "Mejorar plan". Default: /admin/billing/upgrade */
  upgradeHref?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeSeverity(snapshot: MeteringSnapshot): AlertSeverity {
  let maxSeverity: AlertSeverity = "none";
  for (const evt of METERED_EVENTS) {
    const used = snapshot.usage[evt] ?? 0;
    const limit = snapshot.quotas[evt]?.limit ?? Infinity;
    const light = computeTrafficLight(used, limit);
    if (light === "red") return "critical";
    if (light === "yellow") maxSeverity = "warning";
  }
  return maxSeverity;
}

function getCriticalEvents(snapshot: MeteringSnapshot): MeteredEvent[] {
  return METERED_EVENTS.filter((evt) => {
    const used = snapshot.usage[evt] ?? 0;
    const limit = snapshot.quotas[evt]?.limit ?? Infinity;
    return computeTrafficLight(used, limit) === "red";
  });
}

function getWarningEvents(snapshot: MeteringSnapshot): MeteredEvent[] {
  return METERED_EVENTS.filter((evt) => {
    const used = snapshot.usage[evt] ?? 0;
    const limit = snapshot.quotas[evt]?.limit ?? Infinity;
    return computeTrafficLight(used, limit) === "yellow";
  });
}

// ─── Estilos por severidad ────────────────────────────────────────────────────

const BANNER_STYLES: Record<Exclude<AlertSeverity, "none">, string> = {
  warning:  "bg-[var(--data-warning-50)]  border-[var(--data-warning)]  dark:bg-[var(--data-warning)]/20  dark:border-[var(--data-warning)]",
  critical: "bg-[var(--data-error-50)]    border-[var(--data-error)]    dark:bg-[var(--data-error)]/20    dark:border-[var(--data-error)]",
};

const ICON_STYLES: Record<Exclude<AlertSeverity, "none">, string> = {
  warning:  "text-[var(--data-warning)] dark:text-[var(--data-warning)]",
  critical: "text-[var(--data-error)]   dark:text-[var(--data-error)]",
};

const TEXT_STYLES: Record<Exclude<AlertSeverity, "none">, string> = {
  warning:  "text-[var(--data-warning)] dark:text-[var(--data-warning)]",
  critical: "text-[var(--data-error)]   dark:text-[var(--data-error)]",
};

const DETAIL_BUTTON_STYLES: Record<Exclude<AlertSeverity, "none">, string> = {
  warning:  "bg-[var(--data-warning-100)]  hover:bg-[var(--data-warning)]  text-[var(--data-warning)]  dark:bg-[var(--data-warning)]/40  dark:hover:bg-[var(--data-warning)]/60  dark:text-[var(--data-warning)]  border border-[var(--data-warning)]  dark:border-[var(--data-warning)]",
  critical: "bg-[var(--data-error-100)]    hover:bg-[var(--data-error)]    text-[var(--data-error)]    dark:bg-[var(--data-error)]/40    dark:hover:bg-[var(--data-error)]/60    dark:text-[var(--data-error)]    border border-[var(--data-error)]    dark:border-[var(--data-error)]",
};

// ─── Iconos inline (sin dependencia extra) ────────────────────────────────────

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-5 h-5 flex-shrink-0 ${className ?? ""}`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function CriticalIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={`w-5 h-5 flex-shrink-0 ${className ?? ""}`}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function QuotaAlertBanner({ snapshot, upgradeHref = "/admin/billing/upgrade" }: QuotaAlertBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const descId = useId();

  const severity = computeSeverity(snapshot);

  const handleDismiss = useCallback(() => setDismissed(true), []);
  const handleOpenModal = useCallback(() => setModalOpen(true), []);
  const handleCloseModal = useCallback(() => setModalOpen(false), []);

  // No mostrar si no hay alerta o si fue descartado
  if (severity === "none" || dismissed) return null;

  const criticalEvents = getCriticalEvents(snapshot);
  const warningEvents = getWarningEvents(snapshot);

  const isCritical = severity === "critical";
  const affectedEvents = isCritical ? criticalEvents : warningEvents;
  const affectedLabels = affectedEvents.map((e) => EVENT_LABELS[e]).join(", ");

  const message = isCritical
    ? `Has alcanzado el límite en: ${affectedLabels}. Las próximas solicitudes serán limitadas.`
    : `Estás cerca del límite en: ${affectedLabels}.`;

  return (
    <>
      <div
        role="alert"
        aria-live={isCritical ? "assertive" : "polite"}
        aria-atomic="true"
        aria-describedby={descId}
        className={`sticky top-0 z-40 w-full border-b px-4 py-3 flex items-start sm:items-center gap-3 ${BANNER_STYLES[severity]}`}
      >
        {isCritical
          ? <CriticalIcon className={ICON_STYLES[severity]} />
          : <WarningIcon className={ICON_STYLES[severity]} />
        }

        <p
          id={descId}
          className={`flex-1 text-sm font-medium ${TEXT_STYLES[severity]}`}
        >
          {message}
        </p>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Ver detalles */}
          <button
            onClick={handleOpenModal}
            className={`min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${DETAIL_BUTTON_STYLES[severity]}`}
            aria-label="Ver detalles del uso de cuota"
          >
            Ver detalles
          </button>

          {/* Upgrade plan */}
          <a
            href={upgradeHref}
            className="min-h-[44px] min-w-[44px] inline-flex items-center px-3 py-1.5 rounded-lg bg-[#2d6a4f] hover:bg-[#245a42] text-white text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d6a4f]"
            aria-label="Mejorar plan de facturación"
          >
            Mejorar plan
          </a>

          {/* Cerrar */}
          <button
            onClick={handleDismiss}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${ICON_STYLES[severity]} hover:opacity-70`}
            aria-label="Cerrar alerta de cuota"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Modal con detalles */}
      {modalOpen && (
        <QuotaAlertModal
          snapshot={snapshot}
          onClose={handleCloseModal}
          upgradeHref={upgradeHref}
        />
      )}
    </>
  );
}

export default QuotaAlertBanner;
