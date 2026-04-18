"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useMemo } from "react";
import { ChevronLeft, ChevronRight, AlertTriangle, RefreshCw, DollarSign } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Payable {
  id: string;
  supplierName: string;
  amount: number;
  dueDate: string;   // ISO date string
  status: "pending" | "paid" | "overdue";
  description?: string;
}

interface DayData {
  date: Date;
  payables: Payable[];
  isCurrentMonth: boolean;
  isToday: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAYS_ES = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function fmtSoles(amount: number) {
  return `S/ ${amount.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function dayKey(d: Date) {
  return isoDate(d);
}

function getPayableStatus(payable: Payable, today: Date): Payable["status"] {
  if (payable.status === "paid") return "paid";
  const due = new Date(payable.dueDate);
  due.setHours(0, 0, 0, 0);
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  return due < t ? "overdue" : "pending";
}

// ── Demo data for when the API is unavailable ─────────────────────────────────

function generateDemoPayables(): Payable[] {
  const today = new Date();
  return [
    { id: "p1", supplierName: "Distribuidora Norte",   amount: 450,  dueDate: isoDate(addDays(today, 2)),  status: "pending",  description: "Factura #001" },
    { id: "p2", supplierName: "Alicorp",               amount: 1200, dueDate: isoDate(addDays(today, 5)),  status: "pending",  description: "Pedido mensual" },
    { id: "p3", supplierName: "Backus",                amount: 320,  dueDate: isoDate(addDays(today, -2)), status: "overdue",  description: "Bebidas" },
    { id: "p4", supplierName: "Procter & Gamble",      amount: 780,  dueDate: isoDate(addDays(today, 8)),  status: "pending",  description: "Higiene" },
    { id: "p5", supplierName: "Distribuidor Local",    amount: 210,  dueDate: isoDate(addDays(today, 12)), status: "paid",     description: "Abarrotes" },
    { id: "p6", supplierName: "Nestle Peru",           amount: 560,  dueDate: isoDate(addDays(today, 1)),  status: "pending",  description: "Lacteos" },
    { id: "p7", supplierName: "Distribuidora Sur",     amount: 390,  dueDate: isoDate(addDays(today, 15)), status: "pending",  description: "Conservas" },
    { id: "p8", supplierName: "Alicorp",               amount: 650,  dueDate: isoDate(addDays(today, -5)), status: "paid",     description: "Aceites" },
  ];
}

// ── Calendar grid builder ─────────────────────────────────────────────────────

function buildCalendarDays(year: number, month: number, payablesByDay: Map<string, Payable[]>): DayData[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Start from the first Sunday before (or on) firstDay
  const startOffset = firstDay.getDay();
  const calStart = addDays(firstDay, -startOffset);

  // End on the last Saturday after (or on) lastDay
  const endOffset = 6 - lastDay.getDay();
  const calEnd = addDays(lastDay, endOffset);

  const days: DayData[] = [];
  let cursor = new Date(calStart);

  while (cursor <= calEnd) {
    const key = dayKey(cursor);
    const d = new Date(cursor);
    d.setHours(0, 0, 0, 0);
    days.push({
      date: d,
      payables: payablesByDay.get(key) ?? [],
      isCurrentMonth: cursor.getMonth() === month,
      isToday: d.getTime() === today.getTime(),
    });
    cursor = addDays(cursor, 1);
  }

  return days;
}

// ── Status color helper ───────────────────────────────────────────────────────

function _statusDot(status: Payable["status"]) {
  return status === "paid"
    ? "bg-[var(--accent-soft)]"
    : status === "overdue"
    ? "bg-red-500"
    : "bg-amber-400";
}

function statusBadge(status: Payable["status"]) {
  return status === "paid"
    ? "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]"
    : status === "overdue"
    ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
    : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
}

function statusLabel(status: Payable["status"]) {
  return status === "paid" ? "Pagado" : status === "overdue" ? "Vencido" : "Pendiente";
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function PaymentCalendar() {
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [payables, setPayables] = useState<Payable[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payables?limit=100");
      if (res.ok) {
        const data = await res.json();
        const items: Payable[] = Array.isArray(data) ? data : (data.payables ?? []);
        setPayables(items);
        setIsDemo(false);
      } else {
        throw new Error("API unavailable");
      }
    } catch {
      setPayables(generateDemoPayables());
      setIsDemo(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Build payables map by day ──────────────────────────────────────────────
  const payablesByDay = useMemo(() => {
    const map = new Map<string, Payable[]>();
    for (const p of payables) {
      const key = p.dueDate.slice(0, 10);
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, { ...p, status: getPayableStatus(p, today) }]);
    }
    return map;
  }, [payables, today]);

  const calendarDays = useMemo(() => buildCalendarDays(year, month, payablesByDay), [year, month, payablesByDay]);

  // ── Summaries ──────────────────────────────────────────────────────────────
  const thisWeekEnd = addDays(today, 7);
  const nextWeekEnd = addDays(today, 14);

  const thisWeekTotal = useMemo(() =>
    payables
      .filter((p) => {
        const d = new Date(p.dueDate);
        return p.status !== "paid" && d >= today && d < thisWeekEnd;
      })
      .reduce((s, p) => s + p.amount, 0),
    [payables, today, thisWeekEnd]
  );

  const nextWeekTotal = useMemo(() =>
    payables
      .filter((p) => {
        const d = new Date(p.dueDate);
        return p.status !== "paid" && d >= thisWeekEnd && d < nextWeekEnd;
      })
      .reduce((s, p) => s + p.amount, 0),
    [payables, thisWeekEnd, nextWeekEnd]
  );

  const overdueTotal = useMemo(() =>
    payables
      .filter((p) => getPayableStatus(p, today) === "overdue")
      .reduce((s, p) => s + p.amount, 0),
    [payables, today]
  );

  const upcomingAlerts = useMemo(() =>
    payables.filter((p) => {
      const d = new Date(p.dueDate);
      const diff = (d.getTime() - today.getTime()) / 86_400_000;
      return p.status !== "paid" && diff >= 0 && diff < 3;
    }),
    [payables, today]
  );

  // ── Month navigation ───────────────────────────────────────────────────────
  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDay(null);
  };

  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDay(null);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold text-[var(--text-primary)]">Calendario de pagos</CardTitle>
          {isDemo && (
            <span className="text-xs text-[var(--data-warning)] dark:text-[var(--data-warning)]">Modo demo — datos simulados</span>
          )}
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] transition-colors"
          aria-label="Actualizar"
        >
          <RefreshCw size={15} className={cn(loading && "animate-spin")} />
        </button>
      </div>

      {/* Alert: upcoming payments */}
      {upcomingAlerts.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-[var(--data-warning-50)] dark:bg-amber-950/30 border border-[var(--data-warning)] dark:border-[var(--data-warning)]">
          <AlertTriangle size={16} className="text-[var(--data-warning)] dark:text-[var(--data-warning)] shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-[var(--data-warning)] dark:text-[var(--data-warning)]">
              {upcomingAlerts.length} pago{upcomingAlerts.length !== 1 ? "s" : ""} en los proximos 3 dias
            </p>
            <p className="text-xs text-[var(--data-warning)] dark:text-[var(--data-warning)] mt-0.5">
              {upcomingAlerts.map((p) => p.supplierName).join(", ")}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Esta semana", amount: thisWeekTotal, color: "text-[#00B4A6] dark:text-[var(--data-success)]" },
          { label: "Proxima semana", amount: nextWeekTotal, color: "text-[var(--data-success)] dark:text-[var(--data-success)]" },
          { label: "Vencido", amount: overdueTotal, color: overdueTotal > 0 ? "text-[var(--data-error)]" : "text-[var(--text-tertiary)]" },
        ].map(({ label, amount, color }) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-3"
          >
            <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
            <p className={cn("text-base font-bold mt-0.5 tabular-nums", color)}>
              {fmtSoles(amount)}
            </p>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule-base)]">
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)] transition-colors"
            aria-label="Mes anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <h4 className="text-sm font-semibold text-[var(--text-primary)]">
            {MONTHS_ES[month]} {year}
          </h4>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-lg hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)] transition-colors"
            aria-label="Mes siguiente"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 border-b border-[var(--rule-base)]">
          {DAYS_ES.map((d) => (
            <div key={d} className="py-2 text-center text-xs font-medium text-[var(--text-tertiary)]">
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <RefreshCw size={20} className="animate-spin text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
          </div>
        ) : (
          <div className="grid grid-cols-7">
            {calendarDays.map((day, i) => {
              const totalDay = day.payables.reduce((s, p) => s + p.amount, 0);
              const hasOverdue = day.payables.some((p) => p.status === "overdue");
              const hasPaid = day.payables.some((p) => p.status === "paid");
              const hasPending = day.payables.some((p) => p.status === "pending");
              const isSelected = selectedDay?.date.getTime() === day.date.getTime();

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(day.payables.length > 0 ? (isSelected ? null : day) : null)}
                  className={cn(
                    "relative min-h-[64px] p-1.5 text-left border-b border-r border-[var(--rule-base)] transition-colors",
                    !day.isCurrentMonth && "opacity-35",
                    day.isToday && "bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10",
                    isSelected && "bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20",
                    day.payables.length > 0 && "cursor-pointer hover:bg-[var(--surface-sunken)]/50"
                  )}
                >
                  <span
                    className={cn(
                      "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                      day.isToday
                        ? "bg-[#00B4A6] text-white"
                        : "text-[var(--text-secondary)]"
                    )}
                  >
                    {day.date.getDate()}
                  </span>

                  {/* Payment indicator */}
                  {day.payables.length > 0 && (
                    <div className="mt-1">
                      <div className="flex items-center gap-0.5 mb-0.5">
                        {hasOverdue && <span className="w-1.5 h-1.5 rounded-full bg-[var(--data-error)]" />}
                        {hasPending && <span className="w-1.5 h-1.5 rounded-full bg-[var(--data-warning)]" />}
                        {hasPaid && <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-soft)]" />}
                      </div>
                      <span
                        className={cn(
                          "text-[length:var(--ts-2xs)] font-semibold tabular-nums",
                          hasOverdue ? "text-[var(--data-error)]" : hasPending ? "text-[var(--data-warning)] dark:text-[var(--data-warning)]" : "text-[var(--data-success)] dark:text-[var(--data-success)]"
                        )}
                      >
                        {fmtSoles(totalDay)}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected day detail */}
      {selectedDay && selectedDay.payables.length > 0 && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--rule-base)] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <DollarSign size={15} className="text-[#00B4A6]" />
              <h4 className="text-sm font-semibold text-[var(--text-primary)]">
                Pagos del {selectedDay.date.toLocaleDateString("es-PE", { day: "2-digit", month: "long" })}
              </h4>
            </div>
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {fmtSoles(selectedDay.payables.reduce((s, p) => s + p.amount, 0))}
            </span>
          </div>
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {selectedDay.payables.map((p) => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--text-primary)] truncate">{p.supplierName}</p>
                  {p.description && (
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{p.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", statusBadge(p.status))}>
                    {statusLabel(p.status)}
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                    {fmtSoles(p.amount)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
        {[
          { color: "bg-[var(--accent-soft)]", label: "Pagado" },
          { color: "bg-[var(--data-error)]",     label: "Vencido" },
          { color: "bg-[var(--data-warning)]",   label: "Proximo" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={cn("w-2 h-2 rounded-full", color)} />
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}
