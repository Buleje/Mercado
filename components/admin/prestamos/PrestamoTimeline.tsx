'use client';

import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, Circle } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type PrestamoCuota = {
  id: string;
  prestamoId: string;
  numeroCuota: number;
  monto: number;
  fechaVence: string;
  pagadoEn?: string;
  montoPagado?: number;
};

type Props = {
  cuotas: PrestamoCuota[];
  totalCuotas: number;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(n: number) { return `S/${n.toFixed(2)}`; }
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

function diffDays(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
}

type CuotaStatus = "pagada" | "vencida" | "proxima" | "futura";

function getCuotaStatus(c: PrestamoCuota, now: Date, isNextPending: boolean): CuotaStatus {
  if (c.pagadoEn) return "pagada";
  const vence = new Date(c.fechaVence);
  if (vence < now) return "vencida";
  if (isNextPending) return "proxima";
  return "futura";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PrestamoTimeline({ cuotas, totalCuotas }: Props) {
  if (cuotas.length === 0) return null;

  const now = new Date();
  const pagadas = cuotas.filter(c => c.pagadoEn).length;
  const porcentaje = totalCuotas > 0 ? Math.round((pagadas / totalCuotas) * 100) : 0;

  // Find the index of the first unpaid cuota (next pending)
  const nextPendingIdx = cuotas.findIndex(c => !c.pagadoEn);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-gray-700 dark:text-gray-300">
            {pagadas} de {totalCuotas} cuotas pagadas ({porcentaje}%)
          </p>
          <span className={cn(
            "text-xs font-bold px-2 py-0.5 rounded-lg",
            porcentaje === 100
              ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400"
              : porcentaje > 50
                ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
          )}>
            {porcentaje}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${porcentaje}%` }}
          />
        </div>
      </div>

      {/* Timeline */}
      <div className="relative pl-6">
        {cuotas.map((c, i) => {
          const isNextPending = i === nextPendingIdx;

          const status = getCuotaStatus(c, now, isNextPending);
          const isLast = i === cuotas.length - 1;
          const venceDate = new Date(c.fechaVence);
          const days = diffDays(now, venceDate);

          // Line color between nodes
          const currentPaid = status === "pagada";

          return (
            <div key={c.id} className="relative pb-4 last:pb-0">
              {/* Vertical line */}
              {!isLast && (
                <div className={cn(
                  "absolute left-[-14px] top-5 w-0.5 h-[calc(100%-4px)]",
                  currentPaid && (i + 1 < cuotas.length && cuotas[i + 1].pagadoEn)
                    ? "bg-emerald-400 dark:bg-emerald-600"
                    : "bg-gray-200 dark:bg-white/10"
                )} />
              )}

              {/* Node */}
              <div className="absolute left-[-20px] top-0.5">
                {status === "pagada" && (
                  <div className="h-6 w-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                )}
                {status === "vencida" && (
                  <div className="h-6 w-6 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                    <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  </div>
                )}
                {status === "proxima" && (
                  <div className="h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center animate-pulse">
                    <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                )}
                {status === "futura" && (
                  <div className="h-6 w-6 rounded-full border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-card flex items-center justify-center">
                    <Circle className="h-3 w-3 text-gray-400 dark:text-gray-500" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className={cn(
                "ml-2 rounded-xl p-3 transition-colors",
                status === "pagada" && "bg-emerald-50/50 dark:bg-emerald-900/10",
                status === "vencida" && "bg-red-50/50 dark:bg-red-900/10",
                status === "proxima" && "bg-amber-50/50 dark:bg-amber-900/10 ring-1 ring-amber-200 dark:ring-amber-800",
                status === "futura" && "bg-gray-50/50 dark:bg-white/[0.02]",
              )}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    Cuota {c.numeroCuota} &mdash; {formatCurrency(c.monto)}
                  </p>
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded",
                    status === "pagada" && "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
                    status === "vencida" && "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400",
                    status === "proxima" && "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
                    status === "futura" && "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
                  )}>
                    {status === "pagada" && "PAGADA"}
                    {status === "vencida" && "VENCIDA"}
                    {status === "proxima" && "PENDIENTE"}
                    {status === "futura" && "FUTURA"}
                  </span>
                </div>

                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  {status === "pagada" && c.pagadoEn && (
                    <>Pagado el {formatDate(c.pagadoEn)}{c.montoPagado ? ` — ${formatCurrency(c.montoPagado)}` : ""}</>
                  )}
                  {status === "vencida" && (
                    <>Vencida hace {Math.abs(days)} dia{Math.abs(days) !== 1 ? "s" : ""} — {formatDate(c.fechaVence)}</>
                  )}
                  {status === "proxima" && (
                    <>Vence {days === 0 ? "hoy" : days === 1 ? "manana" : `en ${days} dias`} — {formatDate(c.fechaVence)}</>
                  )}
                  {status === "futura" && (
                    <>{formatDate(c.fechaVence)}</>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
