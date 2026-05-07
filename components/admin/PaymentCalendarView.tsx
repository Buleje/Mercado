"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, RefreshCw, CalendarDays,
  TrendingDown, TrendingUp, AlertTriangle, X,
  DollarSign, Clock, Building2,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface FiadoItem {
  id: string;
  customerName: string;
  amount: number;
  dueDate: string;
  status: string;
}

interface PayableItem {
  id: string;
  supplierName: string;
  amount: number;
  dueDate: string;
  status: string;
  description?: string;
}

interface PrestamoItem {
  id: string;
  customerName?: string;
  borrowerName?: string;
  amount: number;
  nextPaymentDate: string;
  nextPaymentAmount: number;
  status: string;
}

interface DayEvents {
  fiados: FiadoItem[];
  payables: PayableItem[];
  prestamos: PrestamoItem[];
}

interface CalendarData {
  [dateKey: string]: DayEvents;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function buildCalendarDays(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // lunes = 0
  const startDow = (first.getDay() + 6) % 7;
  const days: Date[] = [];
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i);
    days.push(d);
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, days.length - (startDow + last.getDate()) + 1));
  }
  return days;
}

function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function PaymentCalendarView() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [calData, setCalData] = useState<CalendarData>({});
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // KPI summary
  const [kpis, setKpis] = useState({
    porCobrarSemana: 0,
    porPagarSemana: 0,
    vencidos: 0,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [fiadosRes, payablesRes, prestamosRes] = await Promise.all([
        fetch("/api/fiados"),
        fetch("/api/payables"),
        fetch("/api/prestamos"),
      ]);

      const [fiadosJson, payablesJson, prestamosJson] = await Promise.all([
        fiadosRes.ok ? fiadosRes.json() : { data: [], fiados: [] },
        payablesRes.ok ? payablesRes.json() : { data: [], payables: [] },
        prestamosRes.ok ? prestamosRes.json() : { data: [], prestamos: [] },
      ]);

      const fiados: FiadoItem[] = (
        fiadosJson.fiados ?? fiadosJson.data ?? fiadosJson ?? []
      ).filter((f: FiadoItem) => f.dueDate);

      const payables: PayableItem[] = (
        payablesJson.payables ?? payablesJson.data ?? payablesJson ?? []
      ).filter((p: PayableItem) => p.dueDate && p.status !== "paid");

      const prestamos: PrestamoItem[] = (
        prestamosJson.prestamos ?? prestamosJson.data ?? prestamosJson ?? []
      ).filter((p: PrestamoItem) => p.nextPaymentDate);

      // Build calendar map
      const map: CalendarData = {};
      const addTo = (key: string, type: "fiados" | "payables" | "prestamos", item: unknown) => {
        if (!map[key]) map[key] = { fiados: [], payables: [], prestamos: [] };
        (map[key][type] as unknown[]).push(item);
      };

      fiados.forEach(f => addTo(f.dueDate.slice(0, 10), "fiados", f));
      payables.forEach(p => addTo(p.dueDate.slice(0, 10), "payables", p));
      prestamos.forEach(p => addTo(p.nextPaymentDate.slice(0, 10), "prestamos", p));
      setCalData(map);

      // KPIs
      const weekStart = today;
      const weekEnd = addDays(today, 7);
      const weekKey = (d: string) => {
        const dt = new Date(d);
        return dt >= weekStart && dt <= weekEnd;
      };

      let porCobrar = 0;
      let porPagar = 0;
      let venc = 0;
      const todayStr = isoDate(today);

      fiados.forEach(f => {
        if (weekKey(f.dueDate)) porCobrar += f.amount;
        if (f.dueDate.slice(0, 10) < todayStr && f.status !== "paid") venc += f.amount;
      });
      prestamos.forEach(p => {
        if (weekKey(p.nextPaymentDate)) porCobrar += p.nextPaymentAmount;
      });
      payables.forEach(p => {
        if (weekKey(p.dueDate)) porPagar += p.amount;
      });

      setKpis({ porCobrarSemana: porCobrar, porPagarSemana: porPagar, vencidos: venc });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const days = useMemo(() => buildCalendarDays(year, month), [year, month]);

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const selectedEvents = selectedDay ? (calData[selectedDay] ?? { fiados: [], payables: [], prestamos: [] }) : null;
  const todayStr = isoDate(today);

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <AlertTriangle className="h-8 w-8 text-[var(--data-error-500)]" />
        <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{error}</p>
        <button onClick={fetchData} className="text-xs text-primary hover:underline">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 border-b-4 border-b-emerald-500">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-[var(--data-success-500)] shrink-0" />
            <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Por cobrar (7d)</p>
          </div>
          <p className="text-lg font-extrabold font-mono text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">{fmt(kpis.porCobrarSemana)}</p>
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 border-b-4 border-b-orange-500">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-[var(--data-warning-500)] shrink-0" />
            <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Por pagar (7d)</p>
          </div>
          <p className="text-lg font-extrabold font-mono text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">{fmt(kpis.porPagarSemana)}</p>
        </div>
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-3 border-b-4 border-b-red-500">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-[var(--data-error-500)] shrink-0" />
            <p className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)]">Vencidos</p>
          </div>
          <p className="text-lg font-extrabold font-mono text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">{fmt(kpis.vencidos)}</p>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Calendar */}
        <div className="flex-1 min-w-0 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
          {/* Month header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule-soft)] dark:border-card-border">
            <button
              onClick={prevMonth}
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <CardTitle className="font-bold text-[var(--text-primary)] text-sm">
                {MONTHS_ES[month]} {year}
              </CardTitle>
            </div>
            <div className="flex gap-1">
              <button
                onClick={fetchData}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Actualizar"
              >
                <RefreshCw className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
              </button>
              <button
                onClick={nextMonth}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                aria-label="Mes siguiente"
              >
                <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
              </button>
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-[var(--rule-soft)] dark:border-card-border">
            {DAYS_ES.map(d => (
              <div key={d} className="py-2 text-center text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--text-tertiary)] dark:text-muted">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const key = isoDate(day);
              const inMonth = day.getMonth() === month;
              const isToday = key === todayStr;
              const events = calData[key];
              const hasFiados = (events?.fiados?.length ?? 0) > 0;
              const hasPayables = (events?.payables?.length ?? 0) > 0;
              const hasPrestamos = (events?.prestamos?.length ?? 0) > 0;
              const hasAny = hasFiados || hasPayables || hasPrestamos;
              const isSelected = selectedDay === key;

              return (
                <button
                  key={idx}
                  onClick={() => setSelectedDay(isSelected ? null : key)}
                  disabled={!inMonth}
                  className={cn(
                    "relative min-h-[56px] p-1.5 border-b border-r border-[var(--rule-soft)] dark:border-card-border/50 text-left transition-colors",
                    inMonth ? "hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer" : "opacity-30 cursor-default",
                    isToday && "bg-primary/5 dark:bg-primary/10",
                    isSelected && "bg-primary/10 dark:bg-primary/20 ring-1 ring-inset ring-primary",
                    idx % 7 === 6 && "border-r-0",
                  )}
                >
                  <span className={cn(
                    "text-xs font-bold inline-flex h-5 w-5 items-center justify-center rounded-full",
                    isToday
                      ? "bg-primary text-white"
                      : "text-[var(--text-secondary)]",
                  )}>
                    {day.getDate()}
                  </span>
                  {hasAny && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {hasFiados && (
                        <span className="inline-block h-2 w-2 rounded-full bg-[var(--data-error-500)]" title="Fiados vencen" />
                      )}
                      {hasPrestamos && (
                        <span className="inline-block h-2 w-2 rounded-full bg-[var(--data-warning-500)]" title="Préstamos por cobrar" />
                      )}
                      {hasPayables && (
                        <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent-soft)]" title="Cuentas por pagar" />
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-4 py-2.5 border-t border-[var(--rule-soft)] dark:border-card-border bg-gray-50 dark:bg-white/5">
            <span className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted">
              <span className="h-2 w-2 rounded-full bg-[var(--data-error-500)] inline-block" /> Fiados
            </span>
            <span className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted">
              <span className="h-2 w-2 rounded-full bg-[var(--data-warning-500)] inline-block" /> Préstamos
            </span>
            <span className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted">
              <span className="h-2 w-2 rounded-full bg-[var(--accent-soft)] inline-block" /> Por pagar
            </span>
          </div>
        </div>

        {/* Side panel */}
        {selectedDay && selectedEvents && (
          <div className="w-72 shrink-0 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--rule-soft)] dark:border-card-border">
              <p className="font-bold text-sm text-[var(--text-primary)]">
                {new Date(selectedDay + "T12:00:00").toLocaleDateString("es-PE", { weekday: "long", day: "numeric", month: "long" })}
              </p>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-white/5 min-w-[36px] min-h-[36px] flex items-center justify-center"
              >
                <X className="h-4 w-4 text-[var(--text-tertiary)]" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {/* Fiados */}
              {selectedEvents.fiados.length > 0 && (
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--data-error-500)] mb-2 flex items-center gap-1">
                    <DollarSign className="h-3 w-3" /> Fiados ({selectedEvents.fiados.length})
                  </p>
                  <div className="space-y-1.5">
                    {selectedEvents.fiados.map(f => (
                      <div key={f.id} className="bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 border border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/30 rounded-lg px-3 py-2">
                        <p className="text-xs font-bold text-[var(--text-primary)] truncate">{f.customerName}</p>
                        <p className="text-[length:var(--ts-xs)] font-mono font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)] mt-0.5">{fmt(f.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Préstamos */}
              {selectedEvents.prestamos.length > 0 && (
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--data-warning-500)] mb-2 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Préstamos ({selectedEvents.prestamos.length})
                  </p>
                  <div className="space-y-1.5">
                    {selectedEvents.prestamos.map(p => (
                      <div key={p.id} className="bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/20 border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/30 rounded-lg px-3 py-2">
                        <p className="text-xs font-bold text-[var(--text-primary)] truncate">{p.customerName ?? p.borrowerName ?? "—"}</p>
                        <p className="text-[length:var(--ts-xs)] font-mono font-bold text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] mt-0.5">{fmt(p.nextPaymentAmount)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Payables */}
              {selectedEvents.payables.length > 0 && (
                <div>
                  <p className="text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--data-success-500)] mb-2 flex items-center gap-1">
                    <Building2 className="h-3 w-3" /> Por pagar ({selectedEvents.payables.length})
                  </p>
                  <div className="space-y-1.5">
                    {selectedEvents.payables.map(p => (
                      <div key={p.id} className="bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 rounded-lg px-3 py-2">
                        <p className="text-xs font-bold text-[var(--text-primary)] truncate">{p.supplierName}</p>
                        {p.description && <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted truncate">{p.description}</p>}
                        <p className="text-[length:var(--ts-xs)] font-mono font-bold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-0.5">{fmt(p.amount)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedEvents.fiados.length === 0 && selectedEvents.prestamos.length === 0 && selectedEvents.payables.length === 0 && (
                <div className="py-8 text-center">
                  <CalendarDays className="h-8 w-8 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mx-auto mb-2" />
                  <p className="text-xs text-[var(--text-tertiary)] dark:text-muted">Sin pagos este día</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
