"use client";

import { Field } from "@/components/admin/shared/Field";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { activateProps } from "@/components/admin/shared/a11y";
import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  CalendarDays,
  List,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Types ───────────────────────────────────────────────────────────────────

type EntryType = "oferta" | "receta" | "post" | "evento";

type CalendarEntry = {
  id: string;
  date: string; // YYYY-MM-DD
  type: EntryType;
  title: string;
  notes: string;
};

const ENTRY_TYPES: { value: EntryType; label: string; color: string; dot: string }[] = [
  {
    value: "oferta",
    label: "Oferta",
    color: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)]",
    dot: "bg-[var(--data-warning-500)]",
  },
  {
    value: "receta",
    label: "Receta",
    color: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    dot: "bg-primary/10",
  },
  {
    value: "post",
    label: "Post",
    color: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
    dot: "bg-primary/10",
  },
  {
    value: "evento",
    label: "Evento",
    color: "bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
    dot: "bg-primary/10",
  },
];

const LS_KEY = "buleje_content_calendar";
const DAYS_OF_WEEK = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const MONTH_NAMES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function toYMD(d: Date) {
  return d.toISOString().split("T")[0];
}

function getDaysInMonth(year: number, month: number): Date[] {
  const result: Date[] = [];
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  // pad start
  for (let i = 0; i < first.getDay(); i++) {
    result.push(new Date(year, month, -first.getDay() + i + 1));
  }
  for (let d = 1; d <= last.getDate(); d++) {
    result.push(new Date(year, month, d));
  }
  // pad end to complete weeks
  while (result.length % 7 !== 0) {
    result.push(new Date(year, month + 1, result.length - last.getDate() - first.getDay() + 1));
  }
  return result;
}

// ── Component ────────────────────────────────────────────────────────────────

export default function ContentCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [view, setView] = useState<"month" | "week">("month");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    date: toYMD(today),
    type: "oferta" as EntryType,
    title: "",
    notes: "",
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  // Load: backend primero, localStorage como cache local instantáneo + fallback.
  // Audit 2026-05-05 (P2-2): antes solo vivía en localStorage → al limpiar
  // navegador o cambiar de dispositivo, el dueño perdía todo el calendario.
  useEffect(() => {
    // Cargar cache local primero para evitar flash de calendario vacío
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setEntries(JSON.parse(raw));
    } catch {}

    // Sync con backend
    let cancelled = false;
    fetch("/api/admin/content-calendar")
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data?.entries) && data.entries.length > 0) {
          setEntries(data.entries);
          try { localStorage.setItem(LS_KEY, JSON.stringify(data.entries)); } catch {}
        }
      })
      .catch(() => { /* silent: queda con cache local */ });
    return () => { cancelled = true; };
  }, []);

  // Persiste en localStorage (instant) + backend (durable). Si backend falla,
  // el local sigue válido y el próximo save reintenta.
  const save = (next: CalendarEntry[]) => {
    setEntries(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {}
    // Fire-and-forget — el cache local cubre el caso de error de red
    fetch("/api/admin/content-calendar", {
      method: "PUT",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ entries: next }),
    }).catch((err) => {
      console.warn("[ContentCalendar] persist falló, cache local OK:", err);
    });
  };

  const idCounter = useRef(0);
  const addEntry = () => {
    if (!form.title.trim()) return;
    idCounter.current += 1;
    const entry: CalendarEntry = {
      id: `entry-${idCounter.current}-${form.date}`,
      date: form.date,
      type: form.type,
      title: form.title.trim(),
      notes: form.notes.trim(),
    };
    save([...entries, entry]);
    setForm({ date: toYMD(today), type: "oferta", title: "", notes: "" });
    setShowForm(false);
  };

  const removeEntry = (id: string) => {
    save(entries.filter((e) => e.id !== id));
  };

  const handleDrop = (targetDate: string) => {
    if (!dragId) return;
    save(entries.map((e) => (e.id === dragId ? { ...e, date: targetDate } : e)));
    setDragId(null);
    setDragOver(null);
  };

  const days = getDaysInMonth(year, month);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1); }
    else setMonth(m => m + 1);
  };

  // Week view: current week
  const getWeekDays = () => {
    const d = new Date(today);
    const day = d.getDay();
    const start = new Date(d);
    start.setDate(d.getDate() - day);
    return Array.from({ length: 7 }, (_, i) => {
      const wd = new Date(start);
      wd.setDate(start.getDate() + i);
      return wd;
    });
  };

  const typeConfig = (type: EntryType) =>
    ENTRY_TYPES.find((t) => t.value === type)!;

  const renderDayCell = (day: Date, isCurrentMonth: boolean) => {
    const ymd = toYMD(day);
    const dayEntries = entries.filter((e) => e.date === ymd);
    const isToday = ymd === toYMD(today);

    return (
      <div
        key={ymd + (isCurrentMonth ? "" : "-out")}
        className={cn(
          "min-h-[80px] rounded-lg border p-1.5 transition",
          isCurrentMonth
            ? "border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)]"
            : "border-[var(--rule-soft)] bg-[var(--surface-alt)]/50",
          dragOver === ymd && "border-primary bg-primary/5",
          "cursor-pointer hover:border-primary/40"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(ymd); }}
        onDragLeave={() => setDragOver(null)}
        onDrop={() => handleDrop(ymd)}
        {...activateProps(() => {
          if (!dragId) {
            setForm((f) => ({ ...f, date: ymd }));
            setShowForm(true);
          }
        })}
      >
        <div
          className={cn(
            "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
            isToday
              ? "bg-primary text-white"
              : isCurrentMonth
              ? "text-[var(--text-primary)]"
              : "text-[var(--text-tertiary)]"
          )}
        >
          {day.getDate()}
        </div>
        <div className="space-y-0.5">
          {dayEntries.slice(0, 3).map((e) => (
            <div
              key={e.id}
              draggable
              onDragStart={(ev) => {
                ev.stopPropagation();
                setDragId(e.id);
              }}
              onDragEnd={() => { setDragId(null); setDragOver(null); }}
              onClick={(ev) => ev.stopPropagation()}
              className={cn(
                "flex items-center gap-1 rounded px-1 py-0.5 text-xs font-medium",
                typeConfig(e.type).color
              )}
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", typeConfig(e.type).dot)} />
              <span className="truncate">{e.title}</span>
              <button
                onClick={(ev) => { ev.stopPropagation(); removeEntry(e.id); }}
                className="ml-auto shrink-0 opacity-60 hover:opacity-100"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
          {dayEntries.length > 3 && (
            <p className="text-center text-xs text-[var(--text-tertiary)]">
              +{dayEntries.length - 3} mas
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-bold text-[var(--text-primary)]">
            Calendario de Contenido
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)]">
            Planifica posts, ofertas y eventos del mes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("month")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition",
              view === "month"
                ? "border-primary bg-primary text-white"
                : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-alt)]"
            )}
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Mes
          </button>
          <button
            onClick={() => setView("week")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition",
              view === "week"
                ? "border-primary bg-primary text-white"
                : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-alt)]"
            )}
          >
            <List className="h-3.5 w-3.5" />
            Semana
          </button>
          {/* TODO(#1): non-standard — hover:#e08c4a is a custom warm hover, no token equivalent */}
          <button
            onClick={() => { setShowForm(true); setForm((f) => ({ ...f, date: toYMD(today) })); }}
            className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#e08c4a]"
          >
            <Plus className="h-3.5 w-3.5" />
            Agregar
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {ENTRY_TYPES.map((t) => (
          <span key={t.value} className={cn("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium", t.color)}>
            <span className={cn("h-2 w-2 rounded-full", t.dot)} />
            {t.label}
          </span>
        ))}
      </div>

      {/* Month nav */}
      {view === "month" && (
        <>
          <div className="flex items-center justify-between">
            <button onClick={prevMonth} className="rounded-lg border border-[var(--rule-base)] p-1.5 hover:bg-[var(--surface-alt)]">
              <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
            <span className="font-semibold text-[var(--text-primary)]">
              {MONTH_NAMES[month]} {year}
            </span>
            <button onClick={nextMonth} className="rounded-lg border border-[var(--rule-base)] p-1.5 hover:bg-[var(--surface-alt)]">
              <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
            </button>
          </div>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1">
            {DAYS_OF_WEEK.map((d) => (
              <div key={d} className="py-1 text-center text-xs font-semibold text-[var(--text-tertiary)]">
                {d}
              </div>
            ))}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const isCurrent = day.getMonth() === month;
              return renderDayCell(day, isCurrent);
            })}
          </div>
        </>
      )}

      {/* Week view */}
      {view === "week" && (
        <div className="grid grid-cols-7 gap-2">
          {getWeekDays().map((day) => {
            const ymd = toYMD(day);
            const dayEntries = entries.filter((e) => e.date === ymd);
            const isToday = ymd === toYMD(today);
            return (
              <div
                key={ymd}
                className="min-h-[120px] rounded-xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] p-2"
              >
                <div className={cn(
                  "mb-2 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                  isToday ? "bg-primary text-white" : "text-[var(--text-primary)]"
                )}>
                  {day.getDate()}
                </div>
                <p className="mb-2 text-xs text-[var(--text-tertiary)]">
                  {DAYS_OF_WEEK[day.getDay()]}
                </p>
                {dayEntries.map((e) => (
                  <div key={e.id} className={cn("mb-1 rounded p-1.5 text-xs font-medium", typeConfig(e.type).color)}>
                    {e.title}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Add entry form */}
      {showForm && (
        <div className="modal-backdrop p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-[var(--color-card)]">
            <div className="flex items-center justify-between border-b border-[var(--rule-soft)] p-5">
              <CardTitle className="font-semibold text-[var(--text-primary)]">
                Nueva entrada
              </CardTitle>
              <button onClick={() => setShowForm(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <Field label="Fecha" labelClassName="mb-1 block text-sm font-medium text-[var(--text-primary)]">
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-alt)] px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </Field>
              <Field label="Tipo" labelClassName="mb-1 block text-sm font-medium text-[var(--text-primary)]">
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EntryType }))}
                  className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-alt)] px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {ENTRY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Titulo" labelClassName="mb-1 block text-sm font-medium text-[var(--text-primary)]">
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ej: Oferta arroz 5kg"
                  className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-alt)] px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </Field>
              <Field label="Notas" labelClassName="mb-1 block text-sm font-medium text-[var(--text-primary)]">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Detalles adicionales..."
                  className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-alt)] px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </Field>
            </div>
            <div className="flex gap-3 border-t border-[var(--rule-soft)] p-5">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-lg border border-[var(--rule-base)] py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-alt)]"
              >
                Cancelar
              </button>
              <button
                onClick={addEntry}
                disabled={!form.title.trim()}
                className="flex-1 rounded-lg bg-primary py-2 text-sm font-semibold text-white transition hover:bg-primary-dark disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
