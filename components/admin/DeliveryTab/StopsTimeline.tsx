"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Clock, MapPin, Phone } from "lucide-react";
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
  pending: "bg-slate-200 text-slate-700",
  arrived: "bg-amber-100 text-amber-800",
  delivered: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  skipped: "bg-slate-100 text-slate-500",
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

  async function handleAction(
    stopId: string,
    action: "arrived" | "delivered" | "failed" | "skipped",
  ) {
    setBusyId(stopId);
    try {
      if (action === "failed") {
        const reason = window.prompt("Motivo del fallo:") ?? "";
        if (!reason.trim()) {
          setBusyId(null);
          return;
        }
        await onMarkStop(stopId, "failed", { failureReason: reason });
      } else {
        await onMarkStop(stopId, action);
      }
    } catch {
      window.alert("No se pudo actualizar la parada. Reintentá.");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && stops.length === 0) {
    return <div className="p-4 text-sm text-slate-500">Cargando paradas…</div>;
  }

  if (stops.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        Esta ruta todavía no tiene paradas.
      </div>
    );
  }

  return (
    <ol className="flex flex-col gap-3 p-3" role="list">
      {stops.map((stop) => {
        const canAct =
          stop.status === "pending" || stop.status === "arrived";
        const isBusy = busyId === stop.id;

        return (
          <li
            key={stop.id}
            className={cn(
              "rounded-xl border bg-white p-3 dark:border-slate-700 dark:bg-slate-800/40",
              stop.status === "delivered" && "border-green-200",
              stop.status === "failed" && "border-red-200",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-bold text-slate-400">
                  #{stop.sequence}
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {stop.customerName}
                </span>
              </div>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                  STATUS_COLORS[stop.status],
                )}
              >
                {STATUS_LABELS[stop.status]}
              </span>
            </div>

            <div className="mt-1.5 flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <div>
                <div>{stop.address}</div>
                {stop.addressDetail && (
                  <div className="text-[11px] text-slate-400">{stop.addressDetail}</div>
                )}
              </div>
            </div>

            {stop.customerPhone && (
              <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                <Phone className="h-3.5 w-3.5" />
                <a
                  href={`tel:${stop.customerPhone}`}
                  className="underline underline-offset-2 hover:text-[#00B4A6]"
                >
                  {stop.customerPhone}
                </a>
              </div>
            )}

            {stop.estimatedArrivalAt && stop.status === "pending" && (
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <Clock className="h-3.5 w-3.5" />
                ETA{" "}
                {new Date(stop.estimatedArrivalAt).toLocaleTimeString("es-PE", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}

            {stop.failureReason && (
              <div className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                {stop.failureReason}
              </div>
            )}

            {canAct && (
              <div className="mt-3 flex flex-wrap gap-2">
                {stop.status === "pending" && (
                  <button
                    type="button"
                    onClick={() => handleAction(stop.id, "arrived")}
                    disabled={isBusy}
                    className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-amber-600 disabled:opacity-50"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Llegué
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleAction(stop.id, "delivered")}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1 rounded-md bg-[#00B4A6] px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-[#00B4A6]/90 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Entregado
                </button>
                <button
                  type="button"
                  onClick={() => handleAction(stop.id, "failed")}
                  disabled={isBusy}
                  className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Falló
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
