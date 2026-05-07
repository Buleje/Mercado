"use client";

import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, ChevronRight,
  AlertTriangle, Check, Clock, Calendar } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

type CalendarEntry = {
  id: string;
  supplierName: string;
  amount: number;
  paidAmount: number;
  status: string;
  daysOverdue: number;
  description: string;
};

type CalendarData = {
  calendar: Record<string, CalendarEntry[]>;
  resumen: {
    venceEstaSemana: number;
    venceEsteMes: number;
    vencido: number;
  };
};

const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const DAYS_ES = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

function SkeletonGrid() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex-1 h-20 bg-gray-200 dark:bg-gray-700 rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="h-16 bg-[var(--surface-sunken)] rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function CxPCalendar() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/compras/cxp-calendar?month=${monthKey}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch { /* silently fail */ }
    setLoading(false);
  }, [monthKey]);

  useEffect(() => { void load(); }, [load]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
    setSelectedDay(null);
  };

  const goToday = () => {
    setYear(now.getFullYear());
    setMonth(now.getMonth());
    setSelectedDay(null);
  };

  // Generate calendar grid
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const cells: Array<{ day: number | null; dateStr: string }> = [];
  for (let i = 0; i < firstDay; i++) {
    cells.push({ day: null, dateStr: "" });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}` });
  }

  const selectedEntries = selectedDay && data?.calendar[selectedDay] ? data.calendar[selectedDay] : [];

  const markPaid = async (payableId: string) => {
    try {
      // We just reload after marking
      await fetch(`/api/payables/${payableId}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status: "pagado" }),
      });
      void load();
    } catch { /* silently fail */ }
  };

  if (loading) return <SkeletonGrid />;

  return (
    <div className="space-y-6">
      {/* Summary strip */}
      {data?.resumen && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]" />
              <p className="text-xs font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] uppercase">Vence esta semana</p>
            </div>
            <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">
              S/ {Number(data.resumen.venceEstaSemana).toFixed(2)}
            </p>
          </div>
          <div className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" />
              <p className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] uppercase">Vence este mes</p>
            </div>
            <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">
              S/ {Number(data.resumen.venceEsteMes).toFixed(2)}
            </p>
          </div>
          <div className="bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" />
              <p className="text-xs font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] uppercase">Vencido</p>
            </div>
            <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">
              S/ {Number(data.resumen.vencido).toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
          <ChevronLeft className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" />
        </button>
        <div className="text-center">
          <CardTitle className="text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground">
            {MONTHS_ES[month]} {year}
          </CardTitle>
          <button onClick={goToday} className="text-xs text-primary hover:underline font-semibold">
            Ir a hoy
          </button>
        </div>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
          <ChevronRight className="h-5 w-5 text-[var(--text-secondary)] dark:text-muted" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-gray-50 dark:bg-accent/50">
          {DAYS_ES.map((d) => (
            <div key={d} className="text-center py-2 text-xs font-bold text-[var(--text-secondary)] dark:text-muted uppercase">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {cells.map((cell, idx) => {
            if (cell.day === null) {
              return <div key={idx} className="h-16 border-t border-r border-[var(--rule-soft)] dark:border-card-border/30 bg-gray-50/50 dark:bg-accent/20" />;
            }

            const entries = data?.calendar[cell.dateStr] ?? [];
            const hasEntries = entries.length > 0;
            const isToday = cell.dateStr === todayStr;
            const isSelected = cell.dateStr === selectedDay;
            const hasOverdue = entries.some((e) => e.daysOverdue > 0 && e.status !== "pagado");
            const totalAmount = entries.reduce((s, e) => s + (e.amount - e.paidAmount), 0);

            return (
              <button
                key={idx}
                onClick={() => setSelectedDay(isSelected ? null : cell.dateStr)}
                className={cn(
                  "h-16 border-t border-r border-[var(--rule-soft)] dark:border-card-border/30 p-1 text-left transition-colors relative",
                  isToday && "ring-2 ring-inset ring-[var(--data-success-500)]/40",
                  isSelected && "bg-primary/5 dark:bg-primary/10",
                  hasOverdue && !isSelected && "bg-[var(--data-error-50)]/60 dark:bg-red-950/10",
                  !hasEntries && "hover:bg-gray-50 dark:hover:bg-accent/30",
                  hasEntries && "hover:bg-primary/5 dark:hover:bg-primary/10 cursor-pointer",
                )}
              >
                <span className={cn(
                  "text-xs font-semibold",
                  isToday ? "text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-extrabold" : "text-[var(--text-secondary)] dark:text-muted",
                )}>
                  {cell.day}
                </span>
                {hasEntries && (
                  <div className="mt-0.5">
                    <div className="flex items-center gap-0.5">
                      <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", hasOverdue ? "bg-[var(--data-error-500)]" : "bg-primary")} />
                      <span className="text-xs font-bold text-[var(--text-primary)] dark:text-foreground truncate">
                        S/{totalAmount.toFixed(0)}
                      </span>
                    </div>
                    {entries.length > 1 && (
                      <span className="text-xs text-[var(--text-tertiary)] dark:text-muted">
                        +{entries.length - 1} mas
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {selectedDay && selectedEntries.length > 0 && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 space-y-3">
          <h4 className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">
            Pagos del {new Date(selectedDay + "T12:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}
          </h4>
          {selectedEntries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                entry.status === "pagado"
                  ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30"
                  : entry.daysOverdue > 0
                    ? "bg-[var(--data-error-50)] dark:bg-red-950/10 border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30"
                    : "bg-gray-50 dark:bg-accent/50 border-[var(--rule-base)] dark:border-card-border",
              )}
            >
              <div>
                <p className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground">{entry.supplierName}</p>
                <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{entry.description}</p>
                {entry.daysOverdue > 0 && entry.status !== "pagado" && (
                  <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] font-semibold mt-0.5">
                    Vencido hace {entry.daysOverdue} dia{entry.daysOverdue !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-extrabold text-[var(--text-primary)] dark:text-foreground">
                    S/ {(entry.amount - entry.paidAmount).toFixed(2)}
                  </p>
                  {entry.paidAmount > 0 && entry.status !== "pagado" && (
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">
                      Abonado: S/ {Number(entry.paidAmount).toFixed(2)}
                    </p>
                  )}
                </div>
                {entry.status !== "pagado" && (
                  <button
                    onClick={() => markPaid(entry.id)}
                    className="p-2 rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success-500)] dark:text-[var(--data-success-500)] hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] transition-colors"
                    title="Marcar como pagado"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
                {entry.status === "pagado" && (
                  <span className="text-xs font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] px-2 py-1 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-full">
                    Pagado
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDay && selectedEntries.length === 0 && (
        <div className="text-center py-6 text-sm text-[var(--text-secondary)] dark:text-muted">
          Sin pagos programados para este dia
        </div>
      )}

      {/* Empty state */}
      {!data?.calendar || Object.keys(data.calendar).length === 0 ? (
        <div className="text-center py-8">
          <Calendar className="h-8 w-8 text-[var(--text-tertiary)] mx-auto mb-2" />
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">Sin pagos programados este mes</p>
        </div>
      ) : null}
    </div>
  );
}
