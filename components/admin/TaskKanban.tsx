"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from "react";
import {
  ListChecks, Plus, Clock, User, Trash2, Pencil, Check, X,
  ChevronLeft, ChevronRight, RefreshCw, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */
type Priority = "urgente" | "normal" | "baja";
type Column = "todo" | "doing" | "done";

interface Task {
  id: string;
  title: string;
  assignedTo: string;
  priority: Priority;
  column: Column;
  createdAt: string;
}

/* ── Config ── */
const STORAGE_KEY = "task_kanban_v2";

const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string; badge: string }> = {
  urgente: {
    label: "Urgente",
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  },
  normal: {
    label: "Normal",
    dot: "bg-yellow-400",
    badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  baja: {
    label: "Baja",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
};

const COL_CONFIG: Record<Column, { label: string; color: string; bg: string }> = {
  todo: {
    label: "Por hacer",
    color: "text-gray-700 dark:text-gray-300",
    bg: "bg-gray-50 dark:bg-gray-800/60",
  },
  doing: {
    label: "En proceso",
    color: "text-blue-700 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/10",
  },
  done: {
    label: "Listo",
    color: "text-emerald-700 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/10",
  },
};

const COLUMNS: Column[] = ["todo", "doing", "done"];
const NEXT_COL: Record<Column, Column | null> = { todo: "doing", doing: "done", done: null };
const PREV_COL: Record<Column, Column | null> = { todo: null, doing: "todo", done: "doing" };

/* ── Component ── */
export default function TaskKanban() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", assignedTo: "", priority: "normal" as Priority });
  const [showReset, setShowReset] = useState(false);

  /* Persistencia */
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setTasks(JSON.parse(stored));
    } catch {
      /* silencio */
    }
  }, []);

  const persist = (next: Task[]) => {
    setTasks(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  /* Acciones */
  const addTask = () => {
    if (!form.title.trim()) return;
    const task: Task = {
      id: crypto.randomUUID(),
      title: form.title.trim(),
      assignedTo: form.assignedTo.trim() || "Sin asignar",
      priority: form.priority,
      column: "todo",
      createdAt: new Date().toISOString().split("T")[0],
    };
    persist([...tasks, task]);
    setForm({ title: "", assignedTo: "", priority: "normal" });
    setShowForm(false);
  };

  const saveEdit = (id: string) => {
    persist(
      tasks.map((t) =>
        t.id === id
          ? { ...t, title: form.title.trim() || t.title, assignedTo: form.assignedTo.trim() || t.assignedTo, priority: form.priority }
          : t
      )
    );
    setEditingId(null);
  };

  const startEdit = (task: Task) => {
    setForm({ title: task.title, assignedTo: task.assignedTo, priority: task.priority });
    setEditingId(task.id);
  };

  const moveTask = (id: string, direction: "next" | "prev") => {
    persist(
      tasks.map((t) => {
        if (t.id !== id) return t;
        const to = direction === "next" ? NEXT_COL[t.column] : PREV_COL[t.column];
        return to ? { ...t, column: to } : t;
      })
    );
  };

  const deleteTask = (id: string) => persist(tasks.filter((t) => t.id !== id));

  const resetDone = () => {
    persist(tasks.filter((t) => t.column !== "done"));
    setShowReset(false);
  };

  /* ── Render ── */
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-[#00B4A6]" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Tablero de Tareas
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReset((s) => !s)}
            className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Limpiar completadas
          </button>
          <button
            onClick={() => { setShowForm((s) => !s); setEditingId(null); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              showForm
                ? "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                : "bg-[#00B4A6] hover:bg-[#235c43] text-white"
            )}
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "Cancelar" : "Nueva tarea"}
          </button>
        </div>
      </div>

      {/* Confirmacion reset */}
      {showReset && (
        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-red-700 dark:text-red-400">
            Esto eliminara todas las tareas en &ldquo;Listo&rdquo;. Continuar?
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={resetDone}
              className="px-3 py-1 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors"
            >
              Eliminar
            </button>
            <button
              onClick={() => setShowReset(false)}
              className="px-3 py-1 rounded-lg border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="rounded-xl border border-[#00B4A6]/30 bg-white dark:bg-gray-800 p-4 space-y-3">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Nueva tarea</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Titulo de la tarea"
              className="sm:col-span-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]"
            />
            <input
              type="text"
              value={form.assignedTo}
              onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
              placeholder="Asignado a"
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]"
            />
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-[#00B4A6]"
            >
              <option value="urgente">Urgente</option>
              <option value="normal">Normal</option>
              <option value="baja">Baja</option>
            </select>
            <button
              onClick={addTask}
              disabled={!form.title.trim()}
              className="rounded-lg bg-[#00B4A6] hover:bg-[#235c43] text-white text-sm font-medium py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Agregar tarea
            </button>
          </div>
        </div>
      )}

      {/* Columnas Kanban */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.column === col);
          const { label, color, bg } = COL_CONFIG[col];

          return (
            <div key={col} className={cn("rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden", bg)}>
              {/* Header de columna */}
              <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <span className={cn("font-semibold text-sm", color)}>{label}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
                  {colTasks.length}
                </span>
              </div>

              {/* Tarjetas */}
              <div className="p-3 space-y-2 min-h-32">
                {colTasks.length === 0 && (
                  <div className="flex items-center justify-center h-20 text-xs text-gray-400 dark:text-gray-600">
                    Sin tareas
                  </div>
                )}

                {colTasks.map((task) => {
                  const pCfg = PRIORITY_CONFIG[task.priority];
                  const isEditing = editingId === task.id;

                  return (
                    <div
                      key={task.id}
                      className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 space-y-2 shadow-sm"
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={form.title}
                            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                            className="w-full rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-[#00B4A6]"
                          />
                          <input
                            type="text"
                            value={form.assignedTo}
                            onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
                            className="w-full rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-[#00B4A6]"
                          />
                          <select
                            value={form.priority}
                            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
                            className="w-full rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-750 px-2 py-1 text-sm text-gray-900 dark:text-gray-100"
                          >
                            <option value="urgente">Urgente</option>
                            <option value="normal">Normal</option>
                            <option value="baja">Baja</option>
                          </select>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => saveEdit(task.id)}
                              className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-[#00B4A6] text-white text-xs"
                            >
                              <Check className="w-3 h-3" />
                              Guardar
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs"
                            >
                              <X className="w-3 h-3" />
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          {/* Titulo y prioridad */}
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-snug">
                              {task.title}
                            </p>
                            <span
                              className={cn(
                                "shrink-0 flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-full",
                                pCfg.badge
                              )}
                            >
                              <span className={cn("w-1.5 h-1.5 rounded-full", pCfg.dot)} />
                              {pCfg.label}
                            </span>
                          </div>

                          {/* Meta */}
                          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
                            <User className="w-3 h-3" />
                            <span>{task.assignedTo}</span>
                            <Clock className="w-3 h-3 ml-auto" />
                            <span>{task.createdAt}</span>
                          </div>

                          {/* Acciones */}
                          <div className="flex items-center gap-1 pt-1 border-t border-gray-100 dark:border-gray-700">
                            {PREV_COL[task.column] && (
                              <button
                                onClick={() => moveTask(task.id, "prev")}
                                title="Mover atras"
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {NEXT_COL[task.column] && (
                              <button
                                onClick={() => moveTask(task.id, "next")}
                                title="Mover adelante"
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <div className="flex-1" />
                            <button
                              onClick={() => startEdit(task)}
                              className="p-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
