"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft, ChevronRight,
  AlertTriangle, Check, Clock, Calendar } from "lucide-react";
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
          <div key={i} className="h-16 bg-gray-100 dark:bg-gray-800 rounded-lg" />
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
        headers: { "Content-Type": "application/json" },
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
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <p className="text-[length:var(--ts-2xs)] font-bold text-amber-600 dark:text-amber-400 uppercase">Vence esta semana</p>
            </div>
            <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">
              S/ {data.resumen.venceEstaSemana.toFixed(2)}
            </p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <p className="text-[length:var(--ts-2xs)] font-bold text-emerald-600 dark:text-emerald-400 uppercase">Vence este mes</p>
            </div>
            <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">
              S/ {data.resumen.venceEsteMes.toFixed(2)}
            </p>
          </div>
          <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <p className="text-[length:var(--ts-2xs)] font-bold text-red-600 dark:text-red-400 uppercase">Vencido</p>
            </div>
            <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">
              S/ {data.resumen.vencido.toFixed(2)}
            </p>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
          <ChevronLeft className="h-5 w-5 text-gray-600 dark:text-muted" />
        </button>
        <div className="text-center">
          <h3 className="text-sm font-extrabold text-gray-900 dark:text-foreground">
            {MONTHS_ES[month]} {year}
          </h3>
          <button onClick={goToday} className="text-xs text-primary hover:underline font-semibold">
            Ir a hoy
          </button>
        </div>
        <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
          <ChevronRight className="h-5 w-5 text-gray-600 dark:text-muted" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-gray-50 dark:bg-accent/50">
          {DAYS_ES.map((d) => (
            <div key={d} className="text-center py-2 text-[length:var(--ts-2xs)] font-bold text-gray-500 dark:text-muted uppercase">
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
                  isToday && "ring-2 ring-inset ring-emerald-400",
                  isSelected && "bg-primary/5 dark:bg-primary/10",
                  hasOverdue && !isSelected && "bg-red-50/60 dark:bg-red-950/10",
                  !hasEntries && "hover:bg-gray-50 dark:hover:bg-accent/30",
                  hasEntries && "hover:bg-primary/5 dark:hover:bg-primary/10 cursor-pointer",
                )}
              >
                <span className={cn(
                  "text-xs font-semibold",
                  isToday ? "text-emerald-600 dark:text-emerald-400 font-extrabold" : "text-gray-600 dark:text-muted",
                )}>
                  {cell.day}
                </span>
                {hasEntries && (
                  <div className="mt-0.5">
                    <div className="flex items-center gap-0.5">
                      <div className={cn("h-1.5 w-1.5 rounded-full shrink-0", hasOverdue ? "bg-red-500" : "bg-primary")} />
                      <span className="text-[length:var(--ts-2xs)] font-bold text-gray-700 dark:text-foreground truncate">
                        S/{totalAmount.toFixed(0)}
                      </span>
                    </div>
                    {entries.length > 1 && (
                      <span className="text-[length:var(--ts-2xs)] text-gray-400 dark:text-muted">
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
          <h4 className="text-sm font-bold text-gray-900 dark:text-foreground">
            Pagos del {new Date(selectedDay + "T12:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}
          </h4>
          {selectedEntries.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border",
                entry.status === "pagado"
                  ? "bg-emerald-50 dark:bg-emerald-950/10 border-emerald-200 dark:border-emerald-800/30"
                  : entry.daysOverdue > 0
                    ? "bg-red-50 dark:bg-red-950/10 border-red-200 dark:border-red-800/30"
                    : "bg-gray-50 dark:bg-accent/50 border-[var(--rule-base)] dark:border-card-border",
              )}
            >
              <div>
                <p className="text-sm font-bold text-gray-900 dark:text-foreground">{entry.supplierName}</p>
                <p className="text-xs text-gray-500 dark:text-muted">{entry.description}</p>
                {entry.daysOverdue > 0 && entry.status !== "pagado" && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-semibold mt-0.5">
                    Vencido hace {entry.daysOverdue} dia{entry.daysOverdue !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-extrabold text-gray-900 dark:text-foreground">
                    S/ {(entry.amount - entry.paidAmount).toFixed(2)}
                  </p>
                  {entry.paidAmount > 0 && entry.status !== "pagado" && (
                    <p className="text-[length:var(--ts-2xs)] text-gray-500 dark:text-muted">
                      Abonado: S/ {entry.paidAmount.toFixed(2)}
                    </p>
                  )}
                </div>
                {entry.status !== "pagado" && (
                  <button
                    onClick={() => markPaid(entry.id)}
                    className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-800/30 transition-colors"
                    title="Marcar como pagado"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                )}
                {entry.status === "pagado" && (
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 px-2 py-1 bg-emerald-100 dark:bg-emerald-900/30 rounded-full">
                    Pagado
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDay && selectedEntries.length === 0 && (
        <div className="text-center py-6 text-sm text-gray-500 dark:text-muted">
          Sin pagos programados para este dia
        </div>
      )}

      {/* Empty state */}
      {!data?.calendar || Object.keys(data.calendar).length === 0 ? (
        <div className="text-center py-8">
          <Calendar className="h-8 w-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-muted">Sin pagos programados este mes</p>
        </div>
      ) : null}
    </div>
  );
}
