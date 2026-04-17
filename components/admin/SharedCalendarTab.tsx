"use client";
import { useState, useMemo } from "react";
import { CalendarDays, Plus, Clock, User, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */
type EventType = "tarea" | "entrega" | "pago" | "reunion" | "recordatorio" | "promocion";
type CalEvent = {
  id: number; title: string; date: string; time: string; type: EventType;
  assignee: string; notes: string;
};

const TYPE_CONFIG: Record<EventType, { label: string; color: string }> = {
  tarea: { label: "Tarea", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700" },
  entrega: { label: "Entrega", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700" },
  pago: { label: "Pago", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300 dark:border-amber-700" },
  reunion: { label: "Reunión", color: "bg-[var(--surface-sunken)] text-[var(--text-primary)] border-purple-300 dark:border-purple-700" },
  recordatorio: { label: "Recordatorio", color: "bg-[var(--surface-sunken)] text-[var(--text-primary)] border-pink-300 dark:border-pink-700" },
  promocion: { label: "Promoción", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300 dark:border-orange-700" },
};

/* ── Seed ── */
const TODAY = new Date();
const toISO = (d: Date) => d.toISOString().split("T")[0];
const _addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
let nextId = 13;

const INITIAL_EVENTS: CalEvent[] = [];

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function SharedCalendarTab() {
  const [events, setEvents] = useState<CalEvent[]>(INITIAL_EVENTS);
  const [view, setView] = useState<"semana" | "lista">("semana");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", date: toISO(TODAY), time: "09:00", type: "tarea" as EventType, assignee: "", notes: "" });
  const [typeFilter, setTypeFilter] = useState<EventType | "todas">("todas");

  const weekDays = useMemo(() => {
    const start = new Date(TODAY);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, []);

  const filteredEvents = typeFilter === "todas" ? events : events.filter(e => e.type === typeFilter);

  const addEvent = () => {
    if (!form.title.trim()) return;
    setEvents(prev => [...prev, { id: nextId++, ...form, assignee: form.assignee || "Sin asignar" }]);
    setForm({ title: "", date: toISO(TODAY), time: "09:00", type: "tarea", assignee: "", notes: "" });
    setShowForm(false);
  };

  const deleteEvent = (id: number) => setEvents(prev => prev.filter(e => e.id !== id));

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <CalendarDays className="h-6 w-6 text-[var(--text-secondary)]" /> Calendario Compartido
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-1">Eventos, entregas, pagos y tareas del equipo</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden">
            <button onClick={() => setView("semana")} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-bold", view === "semana" ? "bg-[var(--text-primary)] text-white" : "bg-white dark:bg-card text-gray-600 dark:text-muted")}>Semana</button>
            <button onClick={() => setView("lista")} className={cn("px-2 sm:px-4 py-1.5 sm:py-2 text-sm font-bold", view === "lista" ? "bg-[var(--text-primary)] text-white" : "bg-white dark:bg-card text-gray-600 dark:text-muted")}>Lista</button>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Nuevo Evento
          </button>
          {events.length > 0 && (
            <button onClick={() => setEvents([])} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
              <Trash2 className="h-4 w-4" /> Borrar todo
            </button>
          )}
        </div>
      </div>

      {/* Type filter */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setTypeFilter("todas")} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", typeFilter === "todas" ? "bg-[var(--text-primary)] text-white" : "bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border text-gray-600 dark:text-muted")}>Todos</button>
        {Object.entries(TYPE_CONFIG).map(([k, v]) => (
          <button key={k} onClick={() => setTypeFilter(k as EventType)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors", typeFilter === k ? "bg-[var(--text-primary)] text-white" : "bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border text-gray-600 dark:text-muted")}>
            {v.label}
          </button>
        ))}
      </div>

      {/* New event form */}
      {showForm && (
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-5 space-y-4">
          <h3 className="font-bold text-gray-900 dark:text-foreground">Nuevo Evento</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-4">
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Título" className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary md:col-span-2" />
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as EventType })} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm font-semibold outline-none focus:border-primary">
              {Object.entries(TYPE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
            <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
            <input value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })} placeholder="Responsable" className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
            <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Notas" className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary md:col-span-3" />
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
            <button onClick={addEvent} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90">Crear Evento</button>
          </div>
        </div>
      )}

      {/* Week View */}
      {view === "semana" && (
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden">
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 border-b border-[var(--rule-soft)] dark:border-card-border">
            {weekDays.map((d, i) => {
              const isToday = toISO(d) === toISO(TODAY);
              return (
                <div key={i} className={cn("p-3 text-center border-r border-[var(--rule-soft)] dark:border-card-border last:border-r-0", isToday && "bg-[var(--surface-sunken)]")}>
                  <p className="text-xs font-bold text-gray-400 dark:text-muted">{DAYS_ES[d.getDay()]}</p>
                  <p className={cn("text-lg font-extrabold mt-0.5", isToday ? "text-[var(--text-secondary)] dark:text-[var(--text-primary)]" : "text-gray-900 dark:text-foreground")}>{d.getDate()}</p>
                </div>
              );
            })}
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 min-h-[240px]">
            {weekDays.map((d, i) => {
              const dayEvents = filteredEvents.filter(e => e.date === toISO(d)).sort((a, b) => a.time.localeCompare(b.time));
              const isToday = toISO(d) === toISO(TODAY);
              return (
                <div key={i} className={cn("p-2 border-r border-[var(--rule-soft)] dark:border-card-border last:border-r-0 space-y-1", isToday && "bg-indigo-50/30 dark:bg-indigo-950/10")}>
                  {dayEvents.map(e => {
                    const tc = TYPE_CONFIG[e.type];
                    return (
                      <div key={e.id} className={cn("rounded-lg border p-2 text-xs cursor-default", tc.color)}>
                        <p className="font-bold truncate">{e.title}</p>
                        {e.time !== "00:00" && <p className="text-[length:var(--ts-2xs)] opacity-75 flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{e.time}</p>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List View */}
      {view === "lista" && (
        <div className="space-y-2">
          {filteredEvents.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).map(e => {
            const tc = TYPE_CONFIG[e.type];
            const d = new Date(e.date + "T00:00:00");
            return (
              <div key={e.id} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 flex flex-wrap items-center gap-2 sm:gap-4 hover:shadow-sm transition-shadow">
                <div className="text-center shrink-0 w-12">
                  <p className="text-xs font-bold text-gray-400">{DAYS_ES[d.getDay()]}</p>
                  <p className="text-lg font-extrabold text-gray-900 dark:text-foreground">{d.getDate()}</p>
                  <p className="text-[length:var(--ts-2xs)] text-gray-400">{MONTHS_ES[d.getMonth()].slice(0, 3)}</p>
                </div>
                <div className={cn("w-1 h-10 rounded-full shrink-0", tc.color.split(" ")[0])} />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-bold text-gray-900 dark:text-foreground truncate">{e.title}</h4>
                    <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full shrink-0", tc.color)}>{tc.label}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400 dark:text-muted mt-0.5">
                    {e.time !== "00:00" && <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{e.time}</span>}
                    <span className="flex items-center gap-0.5"><User className="h-3 w-3" />{e.assignee}</span>
                    {e.notes && <span className="truncate max-w-[200px]">{e.notes}</span>}
                  </div>
                </div>
                <button onClick={() => deleteEvent(e.id)} className="p-2 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0"><Trash2 className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
