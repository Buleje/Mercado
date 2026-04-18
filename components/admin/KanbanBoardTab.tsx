"use client";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState } from "react";
import { ListChecks, Plus, GripVertical, Clock, User, CheckCircle, Trash2, Pencil } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

/* ── Types ── */
type Priority = "baja" | "media" | "alta" | "urgente";
type Column = "pendiente" | "en-progreso" | "completado";
type Task = {
  id: number; title: string; description: string; column: Column;
  priority: Priority; assignee: string; dueDate: string; createdAt: string;
};

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  baja: { label: "Baja", color: "bg-gray-100 text-[var(--text-secondary)] dark:bg-gray-800 dark:text-[var(--text-tertiary)]" },
  media: { label: "Media", color: "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]" },
  alta: { label: "Alta", color: "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]" },
  urgente: { label: "Urgente", color: "bg-[var(--data-error-100)] text-[var(--data-error)] dark:bg-[var(--data-error)]/30 dark:text-[var(--data-error)]" },
};
const COL_CONFIG: Record<Column, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  pendiente: { label: "Pendiente", color: "text-[var(--data-warning)] dark:text-[var(--data-warning)]", bg: "bg-[var(--data-warning-50)] dark:bg-amber-950/10", icon: Clock },
  "en-progreso": { label: "En Progreso", color: "text-[var(--data-success)] dark:text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: ListChecks },
  completado: { label: "Completado", color: "text-[var(--data-success)] dark:text-[var(--data-success)]", bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]", icon: CheckCircle },
};

/* ── Seed Data ── */
let nextId = 1;
const INITIAL_TASKS: Task[] = [];

export default function KanbanBoardTab() {
  const [tasks, setTasks] = useState<Task[]>(INITIAL_TASKS);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState({ title: "", description: "", priority: "media" as Priority, assignee: "", dueDate: "" });
  const [dragTask, setDragTask] = useState<number | null>(null);
  const [filterAssignee, setFilterAssignee] = useState("");

  const assignees = [...new Set(tasks.map(t => t.assignee))];
  const filteredTasks = filterAssignee ? tasks.filter(t => t.assignee === filterAssignee) : tasks;

  const getColumnTasks = (col: Column) => filteredTasks.filter(t => t.column === col);

  const moveTask = (taskId: number, toCol: Column) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, column: toCol } : t));
  };

  const addTask = () => {
    if (!form.title.trim()) return;
    const newTask: Task = { id: nextId++, title: form.title, description: form.description, column: "pendiente", priority: form.priority, assignee: form.assignee || "Sin asignar", dueDate: form.dueDate || "—", createdAt: new Date().toISOString().split("T")[0] };
    setTasks(prev => [...prev, newTask]);
    setForm({ title: "", description: "", priority: "media", assignee: "", dueDate: "" });
    setShowForm(false);
  };

  const deleteTask = (id: number) => setTasks(prev => prev.filter(t => t.id !== id));

  const saveEdit = () => {
    if (!editing) return;
    setTasks(prev => prev.map(t => t.id === editing.id ? editing : t));
    setEditing(null);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2">
            <ListChecks className="h-6 w-6 text-[var(--data-success)]" /> Kanban de Tareas
          </SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-1">Organiza tareas del equipo en columnas de estado</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm font-semibold outline-none focus:border-primary">
            <option value="">Todos</option>
            {assignees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={() => setShowForm(!showForm)} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Nueva Tarea
          </button>
          {tasks.length > 0 && (
            <button onClick={() => setTasks([])} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--data-error)] dark:border-[var(--data-error)] text-[var(--data-error)] dark:text-[var(--data-error)] text-sm font-bold hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 transition-colors">
              <Trash2 className="h-4 w-4" /> Borrar todo
            </button>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
        {(["pendiente", "en-progreso", "completado"] as Column[]).map(col => {
          const c = COL_CONFIG[col];
          const count = getColumnTasks(col).length;
          return (
            <div key={col} className={cn("rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4", c.bg)}>
              <p className={cn("text-sm font-extrabold", c.color)}>{c.label}</p>
              <p className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] dark:text-foreground mt-1">{count}</p>
            </div>
          );
        })}
      </div>

      {/* New task form */}
      {showForm && (
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-3 sm:p-5 space-y-4">
          <CardTitle className="font-bold text-[var(--text-primary)] dark:text-foreground">Nueva Tarea</CardTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Título de la tarea" className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
            <input value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })} placeholder="Responsable" className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descripción" className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
            <div className="flex flex-wrap gap-3">
              <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="flex-1 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as Priority })} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm font-semibold outline-none focus:border-primary">
                <option value="baja">Baja</option><option value="media">Media</option>
                <option value="alta">Alta</option><option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)] hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
            <button onClick={addTask} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90">Crear Tarea</button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-4">
        {(["pendiente", "en-progreso", "completado"] as Column[]).map(col => {
          const conf = COL_CONFIG[col];
          const colTasks = getColumnTasks(col);
          return (
            <div key={col} className={cn("rounded-xl border-2 border-dashed p-4 min-h-[300px]", conf.bg, "border-[var(--rule-base)] dark:border-card-border")}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragTask !== null) { moveTask(dragTask, col); setDragTask(null); } }}>
              <h3 className={cn("text-sm font-extrabold mb-4", conf.color)}>{conf.label} ({colTasks.length})</h3>
              <div className="space-y-3">
                {colTasks.map(t => (
                  <div key={t.id} draggable onDragStart={() => setDragTask(t.id)} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4  hover:shadow-sm transition-shadow cursor-grab active:cursor-grabbing">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <GripVertical className="h-4 w-4 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] shrink-0" />
                        <h4 className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">{t.title}</h4>
                      </div>
                      <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full shrink-0", PRIORITY_CONFIG[t.priority].color)}>
                        {PRIORITY_CONFIG[t.priority].label}
                      </span>
                    </div>
                    {t.description && <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-1 ml-6">{t.description}</p>}
                    <div className="flex items-center justify-between mt-3 ml-6">
                      <div className="flex flex-wrap items-center gap-3 text-[length:var(--ts-xs)] text-[var(--text-tertiary)] dark:text-muted">
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />{t.assignee}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.dueDate}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {col !== "pendiente" && (
                          <button onClick={() => moveTask(t.id, col === "en-progreso" ? "pendiente" : "en-progreso")} className="p-1 rounded text-[var(--text-tertiary)] hover:bg-gray-100 dark:hover:bg-accent text-xs">Atras</button>
                        )}
                        {col !== "completado" && (
                          <button onClick={() => moveTask(t.id, col === "pendiente" ? "en-progreso" : "completado")} className="p-1 rounded text-[var(--text-tertiary)] hover:bg-gray-100 dark:hover:bg-accent text-xs">Adelante</button>
                        )}
                        <button onClick={() => setEditing(t)} className="p-1 rounded text-[var(--text-tertiary)] hover:bg-gray-100 dark:hover:bg-accent"><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => deleteTask(t.id)} className="p-1 rounded text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/20"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && <p className="text-center text-xs text-[var(--text-tertiary)] dark:text-muted py-6">Sin tareas</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white dark:bg-card rounded-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-3 sm:px-6 py-4 border-b border-[var(--rule-soft)] dark:border-card-border flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground">Editar Tarea</CardTitle>
              <button onClick={() => setEditing(null)} className="text-base sm:text-xl font-bold text-[var(--text-tertiary)]">×</button>
            </div>
            <div className="px-3 sm:px-6 py-5 space-y-3">
              <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className="w-full px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm font-bold outline-none focus:border-primary" />
              <input value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} className="w-full px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={editing.assignee} onChange={e => setEditing({ ...editing, assignee: e.target.value })} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
                <select value={editing.priority} onChange={e => setEditing({ ...editing, priority: e.target.value as Priority })} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg border-2 border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-sm font-semibold outline-none focus:border-primary">
                  <option value="baja">Baja</option><option value="media">Media</option>
                  <option value="alta">Alta</option><option value="urgente">Urgente</option>
                </select>
              </div>
            </div>
            <div className="px-3 sm:px-6 py-4 border-t border-[var(--rule-soft)] dark:border-card-border flex flex-wrap justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-bold text-[var(--text-secondary)]">Cancelar</button>
              <button onClick={saveEdit} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
