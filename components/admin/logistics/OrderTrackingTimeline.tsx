"use client";

import { useState, useEffect } from "react";
import { m } from "@/components/admin/providers";
import {
  Package, Truck, CheckCircle, XCircle, ShoppingCart,
  RefreshCw, AlertCircle,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type OrderStatus = "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";

interface StatusHistoryEntry {
  id: string;
  orderId: string;
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  changedBy: string;
  note?: string | null;
  createdAt: string;
}

interface TimelineStep {
  status: OrderStatus;
  label: string;
  description: string;
  icon: React.ElementType;
  timestamp?: string;
  note?: string | null;
  done: boolean;
  current: boolean;
  cancelled?: boolean;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STEPS_DEF: {
  status: OrderStatus;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { status: "pendiente",  label: "Pedido recibido",   description: "El pedido fue registrado en el sistema",            icon: ShoppingCart },
  { status: "confirmado", label: "Confirmado",         description: "El equipo confirmó y está preparando el pedido",   icon: Package },
  { status: "en_camino",  label: "En camino",          description: "El repartidor recogió el pedido y va en ruta",     icon: Truck },
  { status: "entregado",  label: "Entregado",          description: "El pedido llegó a su destino correctamente",       icon: CheckCircle },
];

const STATUS_ORDER: OrderStatus[] = ["pendiente", "confirmado", "en_camino", "entregado"];

function statusIndex(s: OrderStatus) {
  return STATUS_ORDER.indexOf(s);
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-PE", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface OrderTrackingTimelineProps {
  orderId: string;
  currentStatus: OrderStatus;
  /** Historial pre-cargado (opcional — si no se pasa, se fetcha desde la API) */
  history?: StatusHistoryEntry[];
  /** Mostrar label de "Pedido creado" con la fecha de creación */
  createdAt?: string;
  compact?: boolean;
}

export default function OrderTrackingTimeline({
  orderId,
  currentStatus,
  history: externalHistory,
  createdAt,
  compact = false,
}: OrderTrackingTimelineProps) {
  const [history, setHistory] = useState<StatusHistoryEntry[]>(externalHistory ?? []);
  const [loading, setLoading] = useState(!externalHistory);
  const [error, setError]     = useState<string | null>(null);

  useEffect(() => {
    if (externalHistory) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setHistory(data.statusHistory ?? []);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Error al cargar historial");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [orderId, externalHistory]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-4">
        <RefreshCw className="h-4 w-4 animate-spin" /> Cargando historial…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--data-error-500)] py-3">
        <AlertCircle className="h-4 w-4" /> {error}
      </div>
    );
  }

  const isCancelled = currentStatus === "cancelado";
  const currentIdx  = statusIndex(currentStatus);

  // Construir mapa de timestamps por estado
  const timestampMap: Record<string, string>  = {};
  const noteMap: Record<string, string | null> = {};
  if (createdAt) timestampMap["pendiente"] = createdAt;
  for (const entry of history) {
    timestampMap[entry.toStatus] = entry.createdAt;
    if (entry.note) noteMap[entry.toStatus] = entry.note;
  }

  // Construir pasos
  const steps: TimelineStep[] = STEPS_DEF.map((def, i) => {
    const done    = !isCancelled && i <= currentIdx;
    const current = !isCancelled && i === currentIdx;
    return {
      ...def,
      timestamp: timestampMap[def.status],
      note: noteMap[def.status] ?? null,
      done,
      current,
    };
  });

  // Paso de cancelación al final si aplica
  const cancelEntry = history.find(h => h.toStatus === "cancelado");

  return (
    <div className={cn("relative", compact ? "py-2" : "py-1")}>
      {/* Línea vertical */}
      <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-700" />

      <div className="space-y-0">
        {steps.map((step, i) => (
          <m.div
            key={step.status}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07 }}
            className={cn("relative flex gap-4", compact ? "pb-4" : "pb-5")}
          >
            {/* Icono */}
            <m.div
              className={cn(
                "relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2",
                step.done
                  ? "border-primary bg-primary text-white"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]",
              )}
              animate={step.current ? { boxShadow: ["0 0 0 0px rgba(45,106,79,0.4)", "0 0 0 6px rgba(45,106,79,0)", "0 0 0 0px rgba(45,106,79,0)"] } : {}}
              transition={step.current ? { repeat: Infinity, duration: 2 } : {}}
            >
              <step.icon className="h-3.5 w-3.5" />
            </m.div>

            {/* Contenido */}
            <div className="flex-1 min-w-0 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className={cn(
                  "text-xs font-bold",
                  step.done ? "text-[var(--text-primary)] dark:text-[var(--text-primary)]" : "text-[var(--text-tertiary)]",
                  step.current && "text-primary"
                )}>
                  {step.label}
                  {step.current && (
                    <span className="ml-1.5 text-[length:var(--ts-2xs)] font-bold bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] px-1.5 py-0.5 rounded-full">
                      Actual
                    </span>
                  )}
                </p>
                {step.timestamp && (
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fmtDateTime(step.timestamp)}</span>
                )}
              </div>
              {!compact && (
                <p className={cn(
                  "text-[length:var(--ts-xs)] mt-0.5",
                  step.done ? "text-[var(--text-secondary)] dark:text-muted" : "text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]"
                )}>
                  {step.description}
                </p>
              )}
              {step.note && (
                <p className="text-[length:var(--ts-xs)] text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-0.5 italic">
                  &ldquo;{step.note}&rdquo;
                </p>
              )}
            </div>
          </m.div>
        ))}

        {/* Paso de cancelación */}
        {isCancelled && (
          <m.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.28 }}
            className={cn("relative flex gap-4", compact ? "pb-2" : "pb-0")}
          >
            <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)] text-white">
              <XCircle className="h-3.5 w-3.5" />
            </div>
            <div className="flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="text-xs font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">Cancelado</p>
                {cancelEntry && (
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fmtDateTime(cancelEntry.createdAt)}</span>
                )}
              </div>
              {!compact && (
                <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)] dark:text-muted mt-0.5">
                  El pedido fue cancelado
                </p>
              )}
              {cancelEntry?.note && (
                <p className="text-[length:var(--ts-xs)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] mt-0.5 italic">
                  Motivo: &ldquo;{cancelEntry.note}&rdquo;
                </p>
              )}
            </div>
          </m.div>
        )}
      </div>
    </div>
  );
}
