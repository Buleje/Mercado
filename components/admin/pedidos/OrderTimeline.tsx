"use client";

import { m } from "@/components/admin/providers";
import { Check, X, Clock, Package, Truck, CheckCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

interface StatusHistoryEntry {
  toStatus: string;
  createdAt: string;
}

interface OrderTimelineProps {
  currentStatus: string;
  statusHistory?: StatusHistoryEntry[];
  onChangeStatus?: (newStatus: string) => void;
  updating?: boolean;
}

// ── Config ───────────────────────────────────────────────────────────────────

const STEPS = [
  { key: "pendiente", label: "Recibido", icon: Clock, nextAction: "confirmado", actionLabel: "Confirmar pedido" },
  { key: "confirmado", label: "Preparando", icon: Package, nextAction: "en_camino", actionLabel: "Enviar" },
  { key: "en_camino", label: "En camino", icon: Truck, nextAction: "entregado", actionLabel: "Marcar entregado" },
  { key: "entregado", label: "Entregado", icon: CheckCircle },
];

const STATUS_ORDER: Record<string, number> = {
  pendiente: 0,
  confirmado: 1,
  en_camino: 2,
  entregado: 3,
};

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export default function OrderTimeline({
  currentStatus,
  statusHistory = [],
  onChangeStatus,
  updating,
}: OrderTimelineProps) {
  const isCancelled = currentStatus === "cancelado";
  const currentIdx = STATUS_ORDER[currentStatus] ?? -1;

  // Build timestamp map from history
  const timestampMap: Record<string, string> = {};
  for (const entry of statusHistory) {
    timestampMap[entry.toStatus] = entry.createdAt;
  }

  // Find next action
  const currentStep = STEPS.find(s => s.key === currentStatus);
  const nextAction = currentStep?.nextAction;
  const actionLabel = currentStep?.actionLabel;

  return (
    <div className="space-y-3">
      {/* Timeline bar */}
      <div className="relative">
        <div className="flex items-center justify-between">
          {STEPS.map((step, idx) => {
            const stepIdx = STATUS_ORDER[step.key];
            const isCompleted = !isCancelled && currentIdx > stepIdx;
            const isCurrent = !isCancelled && currentIdx === stepIdx;
            const _isFuture = !isCancelled && currentIdx < stepIdx;
            const StepIcon = step.icon;
            const timestamp = timestampMap[step.key];

            return (
              <div key={step.key} className="flex flex-col items-center relative z-10 flex-1">
                {/* Node */}
                <div
                  className={cn(
                    "h-8 w-8 rounded-full flex items-center justify-center border-2 transition-all",
                    isCancelled
                      ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/30"
                      : isCompleted
                        ? "border-[var(--data-success-500)]/30 bg-[var(--accent-soft)] text-white"
                        : isCurrent
                          ? "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 text-[var(--data-warning-500)]"
                          : "border-[var(--rule-base)] dark:border-gray-600 bg-[var(--surface-sunken)] text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]"
                  )}
                >
                  {isCancelled ? (
                    <X className="h-4 w-4 text-[var(--data-error-500)]" />
                  ) : isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : isCurrent ? (
                    <m.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <StepIcon className="h-4 w-4" />
                    </m.div>
                  ) : (
                    <StepIcon className="h-4 w-4" />
                  )}
                </div>

                {/* Label */}
                <p className={cn(
                  "text-[length:var(--ts-2xs)] font-bold mt-1 text-center",
                  isCancelled
                    ? "text-[var(--data-error-500)]"
                    : isCompleted
                      ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
                      : isCurrent
                        ? "text-[var(--data-warning-500)]"
                        : "text-[var(--text-tertiary)]"
                )}>
                  {step.label}
                </p>

                {/* Timestamp */}
                {timestamp && (
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
                    {fmtDate(timestamp)} {fmtTime(timestamp)}
                  </p>
                )}

                {/* Connector line (between nodes) */}
                {idx < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "absolute top-4 h-0.5 z-0",
                      isCancelled
                        ? "bg-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30"
                        : isCompleted
                          ? "bg-[var(--accent-soft)]"
                          : "bg-gray-200 dark:bg-gray-700"
                    )}
                    style={{
                      left: "50%",
                      width: "100%",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="flex items-center gap-2 p-2 rounded-lg bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30">
          <X className="h-4 w-4 text-[var(--data-error-500)] shrink-0" />
          <p className="text-xs font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">Pedido cancelado</p>
        </div>
      )}

      {/* Action buttons */}
      {!isCancelled && nextAction && onChangeStatus && (
        <div className="flex gap-2">
          <button
            onClick={() => onChangeStatus(nextAction)}
            disabled={updating}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {updating ? (
              <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5" />
            )}
            {actionLabel}
          </button>
          <button
            onClick={() => onChangeStatus("cancelado")}
            disabled={updating}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--data-error-50)] dark:bg-red-950/20 text-[var(--data-error-500)] text-xs font-bold hover:bg-[var(--data-error-100)] disabled:opacity-50 transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
