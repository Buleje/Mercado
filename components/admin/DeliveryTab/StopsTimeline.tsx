"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Clock, MapPin, Phone, AlertCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DeliveryStopView, StopStatus } from "./types";

const STATUS_LABELS: Record<StopStatus, string> = {
  pending: "Pendiente",
  arrived: "Llegó",
  delivered: "Entregado",
  failed: "Fallida",
  skipped: "Saltada",
};

const STATUS_COLORS: Record<StopStatus, string> = {
  pending: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  arrived: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]",
  delivered: "bg-[var(--accent-soft)] text-[var(--data-success-500)]",
  failed: "bg-[var(--data-error-100)] text-[var(--data-error-500)]",
  skipped: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
};

interface StopsTimelineProps {
  stops: DeliveryStopView[];
  loading: boolean;
  onMarkStop: (
    stopId: string,
    status: "arrived" | "delivered" | "failed" | "skipped",
    opts?: { failureReason?: string },
  ) => Promise<void>;
}

export function StopsTimeline({ stops, loading, onMarkStop }: StopsTimelineProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // FIX 2026-05-06: window.prompt() reemplazado por inline input dentro de
  // la card para que sea consistente con el DS y no bloquee el event loop.
  const [failingStopId, setFailingStopId] = useState<string | null>(null);
  const [failureReason, setFailureReason] = useState("");

  async function handleAction(
    stopId: string,
    action: "arrived" | "delivered" | "skipped",
  ) {
    setBusyId(stopId);
    setError(null);
    try {
      await onMarkStop(stopId, action);
    } catch (err) {
      setError(`No se pudo actualizar la parada: ${err instanceof Error ? err.message : "desconocido"}`);
    } finally {
      setBusyId(null);
    }
  }

  async function handleConfirmFail(stopId: string) {
    if (!failureReason.trim()) {
      setError("Indicá un motivo de fallo.");
      return;
    }
    setBusyId(stopId);
    setError(null);
    try {
      await onMarkStop(stopId, "failed", { failureReason: failureReason.trim() });
      setFailingStopId(null);
      setFailureReason("");
    } catch (err) {
      setError(`No se pudo registrar el fallo: ${err instanceof Error ? err.message : "desconocido"}`);
    } finally {
      setBusyId(null);
    }
  }

  if (loading && stops.length === 0) {
    return (
      <div className="p-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] p-4 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  if (stops.length === 0) {
    return (
      <div className="p-8 text-center">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-sunken)] mb-3">
          <MapPin className="h-6 w-6 text-[var(--text-tertiary)]" />
        </span>
        <p className="font-display text-base font-extrabold text-[var(--text-primary)]">
          Sin paradas
        </p>
        <p className="text-sm text-[var(--text-tertiary)] mt-1">
          Esta ruta todavía no tiene paradas asignadas.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3">
      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 rounded-xl text-sm text-[var(--data-error-500)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="font-bold flex-1">{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="p-1 rounded hover:bg-[var(--data-error-100)]"
            aria-label="Cerrar error"
          >
            <XCircle className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <ol className="flex flex-col gap-3" role="list">
        {stops.map((stop) => {
          const canAct =
            stop.status === "pending" || stop.status === "arrived";
          const isBusy = busyId === stop.id;
          const isFailing = failingStopId === stop.id;

          return (
            <li
              key={stop.id}
              className={cn(
                "rounded-xl border p-4 bg-[var(--surface-raised)]",
                stop.status === "delivered" && "border-[var(--data-success-500)]/30",
                stop.status === "failed" && "border-[var(--data-error-500)]/40",
                stop.status !== "delivered" && stop.status !== "failed" && "border-[var(--rule-base)]",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-baseline gap-2 min-w-0">
                  <span className="text-sm font-extrabold text-[var(--text-tertiary)] tabular-nums shrink-0">
                    #{stop.sequence}
                  </span>
                  <span className="font-extrabold text-[var(--text-primary)] truncate">
                    {stop.customerName}
                  </span>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider shrink-0",
                    STATUS_COLORS[stop.status],
                  )}
                >
                  {STATUS_LABELS[stop.status]}
                </span>
              </div>

              <div className="mt-2 flex items-start gap-1.5 text-sm text-[var(--text-secondary)]">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                <div className="min-w-0">
                  <div className="leading-snug">{stop.address}</div>
                  {stop.addressDetail && (
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5">{stop.addressDetail}</div>
                  )}
                </div>
              </div>

              {stop.customerPhone && (
                <div className="mt-2 flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                  <Phone className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <a
                    href={`tel:${stop.customerPhone}`}
                    className="font-mono font-bold underline underline-offset-2 hover:text-primary"
                  >
                    {stop.customerPhone}
                  </a>
                </div>
              )}

              {stop.estimatedArrivalAt && stop.status === "pending" && (
                <div className="mt-2 flex items-center gap-1 text-sm text-[var(--text-tertiary)] font-bold">
                  <Clock className="h-4 w-4" />
                  ETA{" "}
                  {new Date(stop.estimatedArrivalAt).toLocaleTimeString("es-PE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}

              {stop.failureReason && (
                <div className="mt-2 rounded-lg bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 px-3 py-2 text-sm text-[var(--data-error-500)] font-bold">
                  ⚠ {stop.failureReason}
                </div>
              )}

              {/* Inline form para failure reason (reemplaza window.prompt) */}
              {isFailing && (
                <div className="mt-3 rounded-lg bg-[var(--data-error-50)] border border-[var(--data-error-500)]/30 p-3 space-y-2">
                  <label htmlFor={`fail-${stop.id}`} className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--data-error-500)]">
                    Motivo del fallo
                  </label>
                  <input
                    id={`fail-${stop.id}`}
                    type="text"
                    value={failureReason}
                    onChange={(e) => setFailureReason(e.target.value)}
                    placeholder="Cliente ausente, dirección incorrecta…"
                    className="w-full px-3 h-10 rounded-lg border border-[var(--data-error-500)]/40 bg-[var(--surface-raised)] text-sm font-medium text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-[var(--data-error-500)]/30"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setFailingStopId(null); setFailureReason(""); }}
                      className="flex-1 h-9 rounded-lg text-xs font-bold text-[var(--text-primary)] bg-[var(--surface-sunken)] hover:brightness-95 border border-[var(--rule-base)]"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleConfirmFail(stop.id)}
                      disabled={isBusy}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-bold text-white bg-[var(--data-error-500)] hover:brightness-95 disabled:opacity-50"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Confirmar fallo
                    </button>
                  </div>
                </div>
              )}

              {canAct && !isFailing && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {stop.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => handleAction(stop.id, "arrived")}
                      disabled={isBusy}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--data-warning-500)] px-3 h-9 text-xs font-bold text-white transition hover:brightness-95 disabled:opacity-50"
                    >
                      <Clock className="h-4 w-4" />
                      Llegué
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleAction(stop.id, "delivered")}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 h-9 text-xs font-bold text-white transition hover:bg-primary-dark disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Entregado
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFailingStopId(stop.id); setFailureReason(""); }}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)] px-3 h-9 text-xs font-bold text-[var(--data-error-500)] transition hover:bg-[var(--data-error-50)] disabled:opacity-50"
                  >
                    <XCircle className="h-4 w-4" />
                    Falló
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
