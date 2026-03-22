"use client";
import { useState } from "react";
import { ListChecks, Plus, GripVertical, Clock, User, CheckCircle, Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */
type Priority = "baja" | "media" | "alta" | "urgente";
type Column = "pendiente" | "en-progreso" | "completado";
type Task = {
  id: number; title: string; description: string; column: Column;
  priority: Priority; assignee: string; dueDate: string; createdAt: string;
};

const PRIORITY_CONFIG: Record<Priority, { label: string; color: string }> = {
  baja: { label: "Baja", color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  media: { label: "Media", color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
  alta: { label: "Alta", color: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400" },
  urgente: { label: "Urgente", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};
const COL_CONFIG: Record<Column, { label: string; color: string; bg: string; icon: any }> = {
  pendiente: { label: "📋 Pendiente", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/10", icon: Clock },
  "en-progreso": { label: "🔄 En Progreso", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/10", icon: ListChecks },
  completado: { label: "✅ Completado", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/10", icon: CheckCircle },
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
          <h2 className="text-xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <ListChecks className="h-6 w-6 text-blue-500" /> Kanban de Tareas
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-1">Organiza tareas del equipo en columnas de estado</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm font-semibold outline-none focus:border-primary">
            <option value="">Todos</option>
            {assignees.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={() => setShowForm(!showForm)} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
            <Plus className="h-4 w-4" /> Nueva Tarea
          </button>
          {tasks.length > 0 && (
            <button onClick={() => setTasks([])} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-bold hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
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
            <div key={col} className={cn("rounded-2xl border border-gray-200 dark:border-card-border p-4", c.bg)}>
              <p className={cn("text-sm font-extrabold", c.color)}>{c.label}</p>
              <p className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground mt-1">{count}</p>
            </div>
          );
        })}
      </div>

      {/* New task form */}
      {showForm && (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5 space-y-4">
          <h3 className="font-bold text-gray-900 dark:text-foreground">Nueva Tarea</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Título de la tarea" className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
            <input value={form.assignee} onChange={e => setForm({ ...form, assignee: e.target.value })} placeholder="Responsable" className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
            <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Descripción" className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
            <div className="flex flex-wrap gap-3">
              <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} className="flex-1 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as Priority })} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm font-semibold outline-none focus:border-primary">
                <option value="baja">Baja</option><option value="media">Media</option>
                <option value="alta">Alta</option><option value="urgente">Urgente</option>
              </select>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
            <button onClick={addTask} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90">Crear Tarea</button>
          </div>
        </div>
      )}

      {/* Kanban Board */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-4">
        {(["pendiente", "en-progreso", "completado"] as Column[]).map(col => {
          const conf = COL_CONFIG[col];
          const colTasks = getColumnTasks(col);
          return (
            <div key={col} className={cn("rounded-2xl border-2 border-dashed p-4 min-h-[300px]", conf.bg, "border-gray-200 dark:border-card-border")}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { if (dragTask !== null) { moveTask(dragTask, col); setDragTask(null); } }}>
              <h3 className={cn("text-sm font-extrabold mb-4", conf.color)}>{conf.label} ({colTasks.length})</h3>
              <div className="space-y-3">
                {colTasks.map(t => (
                  <div key={t.id} draggable onDragStart={() => setDragTask(t.id)} className="bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-card-border p-4 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <GripVertical className="h-4 w-4 text-gray-300 dark:text-gray-600 shrink-0" />
                        <h4 className="font-bold text-sm text-gray-900 dark:text-foreground">{t.title}</h4>
                      </div>
                      <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0", PRIORITY_CONFIG[t.priority].color)}>
                        {PRIORITY_CONFIG[t.priority].label}
                      </span>
                    </div>
                    {t.description && <p className="text-xs text-gray-500 dark:text-muted mt-1 ml-6">{t.description}</p>}
                    <div className="flex items-center justify-between mt-3 ml-6">
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-400 dark:text-muted">
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />{t.assignee}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.dueDate}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {col !== "pendiente" && (
                          <button onClick={() => moveTask(t.id, col === "en-progreso" ? "pendiente" : "en-progreso")} className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-accent text-xs">←</button>
                        )}
                        {col !== "completado" && (
                          <button onClick={() => moveTask(t.id, col === "pendiente" ? "en-progreso" : "completado")} className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-accent text-xs">→</button>
                        )}
                        <button onClick={() => setEditing(t)} className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:hover:bg-accent"><Pencil className="h-3 w-3" /></button>
                        <button onClick={() => deleteTask(t.id)} className="p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20"><Trash2 className="h-3 w-3" /></button>
                      </div>
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && <p className="text-center text-xs text-gray-400 dark:text-muted py-6">Sin tareas</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditing(null)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-3 sm:px-6 py-4 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Editar Tarea</h3>
              <button onClick={() => setEditing(null)} className="text-base sm:text-xl font-bold text-gray-400">×</button>
            </div>
            <div className="px-3 sm:px-6 py-5 space-y-3">
              <input value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} className="w-full px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm font-bold outline-none focus:border-primary" />
              <input value={editing.description} onChange={e => setEditing({ ...editing, description: e.target.value })} className="w-full px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={editing.assignee} onChange={e => setEditing({ ...editing, assignee: e.target.value })} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm outline-none focus:border-primary" />
                <select value={editing.priority} onChange={e => setEditing({ ...editing, priority: e.target.value as Priority })} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-card text-sm font-semibold outline-none focus:border-primary">
                  <option value="baja">Baja</option><option value="media">Media</option>
                  <option value="alta">Alta</option><option value="urgente">Urgente</option>
                </select>
              </div>
            </div>
            <div className="px-3 sm:px-6 py-4 border-t border-gray-100 dark:border-card-border flex flex-wrap justify-end gap-2">
              <button onClick={() => setEditing(null)} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl text-sm font-bold text-gray-500">Cancelar</button>
              <button onClick={saveEdit} className="px-2 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
