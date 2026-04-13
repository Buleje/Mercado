"use client";

import { m } from "@/components/admin/providers";
import { Check, X, Clock, Package, Truck, CheckCircle } from "lucide-react";
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
                      ? "border-red-300 bg-red-50 dark:bg-red-950/30"
                      : isCompleted
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : isCurrent
                          ? "border-[#f97316] bg-[#f97316]/10 text-[#f97316]"
                          : "border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600"
                  )}
                >
                  {isCancelled ? (
                    <X className="h-4 w-4 text-red-500" />
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
                  "text-[10px] font-bold mt-1 text-center",
                  isCancelled
                    ? "text-red-400"
                    : isCompleted
                      ? "text-emerald-600 dark:text-emerald-400"
                      : isCurrent
                        ? "text-[#f97316]"
                        : "text-gray-400 dark:text-gray-500"
                )}>
                  {step.label}
                </p>

                {/* Timestamp */}
                {timestamp && (
                  <p className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5">
                    {fmtDate(timestamp)} {fmtTime(timestamp)}
                  </p>
                )}

                {/* Connector line (between nodes) */}
                {idx < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "absolute top-4 h-0.5 z-0",
                      isCancelled
                        ? "bg-red-200 dark:bg-red-800/30"
                        : isCompleted
                          ? "bg-emerald-400"
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
        <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30">
          <X className="h-4 w-4 text-red-500 shrink-0" />
          <p className="text-xs font-bold text-red-600 dark:text-red-400">Pedido cancelado</p>
        </div>
      )}

      {/* Action buttons */}
      {!isCancelled && nextAction && onChangeStatus && (
        <div className="flex gap-2">
          <button
            onClick={() => onChangeStatus(nextAction)}
            disabled={updating}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#00B4A6] text-white text-xs font-bold hover:bg-[#009690] disabled:opacity-50 transition-colors"
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
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/20 text-red-600 text-xs font-bold hover:bg-red-100 disabled:opacity-50 transition-colors"
          >
            <X className="h-3.5 w-3.5" /> Cancelar
          </button>
        </div>
      )}
    </div>
  );
}
