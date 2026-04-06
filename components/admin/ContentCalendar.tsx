"use client";
 

import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  CalendarDays,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
    color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    dot: "bg-orange-400",
  },
  {
    value: "receta",
    label: "Receta",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    dot: "bg-blue-400",
  },
  {
    value: "post",
    label: "Post",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    dot: "bg-purple-400",
  },
  {
    value: "evento",
    label: "Evento",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    dot: "bg-emerald-400",
  },
];

const LS_KEY = "bsm_content_calendar";
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

  // Load from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setEntries(JSON.parse(raw));
    } catch {}
  }, []);

  const save = (next: CalendarEntry[]) => {
    setEntries(next);
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch {}
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
            ? "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
            : "border-gray-100 bg-gray-50/50 dark:border-gray-800 dark:bg-gray-900/30",
          dragOver === ymd && "border-[#00B4A6] bg-[#00B4A6]/5",
          "cursor-pointer hover:border-[#00B4A6]/40"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(ymd); }}
        onDragLeave={() => setDragOver(null)}
        onDrop={() => handleDrop(ymd)}
        onClick={() => {
          if (!dragId) {
            setForm((f) => ({ ...f, date: ymd }));
            setShowForm(true);
          }
        }}
      >
        <div
          className={cn(
            "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
            isToday
              ? "bg-[#00B4A6] text-white"
              : isCurrentMonth
              ? "text-gray-700 dark:text-gray-300"
              : "text-gray-300 dark:text-gray-600"
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
            <p className="text-center text-xs text-gray-400">
              +{dayEntries.length - 3} mas
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Calendario de Contenido
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Planifica posts, ofertas y eventos del mes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView("month")}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition",
              view === "month"
                ? "border-[#00B4A6] bg-[#00B4A6] text-white"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
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
                ? "border-[#00B4A6] bg-[#00B4A6] text-white"
                : "border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
            )}
          >
            <List className="h-3.5 w-3.5" />
            Semana
          </button>
          <button
            onClick={() => { setShowForm(true); setForm((f) => ({ ...f, date: toYMD(today) })); }}
            className="flex items-center gap-1.5 rounded-lg bg-[#f97316] px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-[#e08c4a]"
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
            <button onClick={prevMonth} className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              <ChevronLeft className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
            <span className="font-semibold text-gray-900 dark:text-white">
              {MONTH_NAMES[month]} {year}
            </span>
            <button onClick={nextMonth} className="rounded-lg border border-gray-200 p-1.5 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              <ChevronRight className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
          {/* Day headers */}
          <div className="grid grid-cols-7 gap-1">
            {DAYS_OF_WEEK.map((d) => (
              <div key={d} className="py-1 text-center text-xs font-semibold text-gray-400">
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
                className="min-h-[120px] rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900"
              >
                <div className={cn(
                  "mb-2 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                  isToday ? "bg-[#00B4A6] text-white" : "text-gray-700 dark:text-gray-300"
                )}>
                  {day.getDate()}
                </div>
                <p className="mb-2 text-xs text-gray-400">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 p-5 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Nueva entrada
              </h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Fecha
                </label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#00B4A6] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Tipo
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as EntryType }))}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#00B4A6] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                >
                  {ENTRY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Titulo
                </label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Ej: Oferta arroz 5kg"
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#00B4A6] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Notas
                </label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Detalles adicionales..."
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#00B4A6] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-100 p-5 dark:border-gray-800">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 rounded-lg border border-gray-200 py-2 text-sm text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
              >
                Cancelar
              </button>
              <button
                onClick={addEntry}
                disabled={!form.title.trim()}
                className="flex-1 rounded-lg bg-[#00B4A6] py-2 text-sm font-semibold text-white transition hover:bg-[#009690] disabled:opacity-50"
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
