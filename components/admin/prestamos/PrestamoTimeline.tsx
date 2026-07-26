'use client';

import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Clock, Circle } from "@buleje/design-system/icons";

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

type CuotaStatus = "pagada" | "vencida" | "próxima" | "futura";

function getCuotaStatus(c: PrestamoCuota, now: Date, isNextPending: boolean): CuotaStatus {
  if (c.pagadoEn) return "pagada";
  const vence = new Date(c.fechaVence);
  if (vence < now) return "vencida";
  if (isNextPending) return "próxima";
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
    <div className="space-y-6">
      {/* Summary bar */}
      <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-[var(--text-secondary)]">
            {pagadas} de {totalCuotas} cuotas pagadas ({porcentaje}%)
          </p>
          <span className={cn(
            "text-xs font-bold px-2 py-0.5 rounded-lg",
            porcentaje === 100
              ? "bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)]"
              : porcentaje > 50
                ? "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
                : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
          )}>
            {porcentaje}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-primary/10 transition-all duration-[var(--dur-slow)]"
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
                    ? "bg-primary/10 dark:bg-primary/10"
                    : "bg-gray-200 dark:bg-white/10"
                )} />
              )}

              {/* Node */}
              <div className="absolute left-[-20px] top-0.5">
                {status === "pagada" && (
                  <div className="h-6 w-6 rounded-full bg-primary/10 dark:bg-primary/15 flex items-center justify-center">
                    <CheckCircle2 className="h-4 w-4 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" />
                  </div>
                )}
                {status === "vencida" && (
                  <div className="h-6 w-6 rounded-full bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/40 flex items-center justify-center">
                    <XCircle className="h-4 w-4 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" />
                  </div>
                )}
                {status === "próxima" && (
                  <div className="h-6 w-6 rounded-full bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/40 flex items-center justify-center animate-pulse">
                    <Clock className="h-4 w-4 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" />
                  </div>
                )}
                {status === "futura" && (
                  <div className="h-6 w-6 rounded-full border-2 border-[var(--rule-base)] dark:border-gray-600 bg-[var(--surface-raised)] flex items-center justify-center">
                    <Circle className="h-3 w-3 text-[var(--text-tertiary)]" />
                  </div>
                )}
              </div>

              {/* Content */}
              <div className={cn(
                "ml-2 rounded-xl p-3 transition-colors",
                status === "pagada" && "bg-primary/10/50 dark:bg-primary/15",
                status === "vencida" && "bg-[var(--data-error-50)]/50 dark:bg-[var(--data-error-500)]/10",
                status === "próxima" && "bg-[var(--data-warning-50)]/50 dark:bg-[var(--data-warning-500)]/10 ring-1 ring-[var(--data-warning-500)] dark:ring-[var(--data-warning-500)]",
                status === "futura" && "bg-gray-50/50 dark:bg-white/[0.02]",
              )}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-[var(--text-primary)]">
                    Cuota {c.numeroCuota} — {formatCurrency(c.monto)}
                  </p>
                  <span className={cn(
                    "text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded",
                    status === "pagada" && "bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
                    status === "vencida" && "bg-[var(--data-error-100)] dark:bg-[var(--data-error-500)]/30 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]",
                    status === "próxima" && "bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]",
                    status === "futura" && "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                  )}>
                    {status === "pagada" && "PAGADA"}
                    {status === "vencida" && "VENCIDA"}
                    {status === "próxima" && "PENDIENTE"}
                    {status === "futura" && "FUTURA"}
                  </span>
                </div>

                <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-1">
                  {status === "pagada" && c.pagadoEn && (
                    <>Pagado el {formatDate(c.pagadoEn)}{c.montoPagado ? ` — ${formatCurrency(c.montoPagado)}` : ""}</>
                  )}
                  {status === "vencida" && (
                    <>Vencida hace {Math.abs(days)} dia{Math.abs(days) !== 1 ? "s" : ""} — {formatDate(c.fechaVence)}</>
                  )}
                  {status === "próxima" && (
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
