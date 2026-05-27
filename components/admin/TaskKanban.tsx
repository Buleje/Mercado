"use client";
import { SectionTitle } from "@buleje/design-system";
 
import { useState, useEffect } from "react";
import {
  ListChecks, Plus, Clock, User, Trash2, Pencil, Check, X,
  ChevronLeft, ChevronRight, RefreshCw } from "@buleje/design-system/icons";
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
    dot: "bg-[var(--data-error-500)]",
    badge: "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]",
  },
  normal: {
    label: "Normal",
    dot: "bg-[var(--data-warning-500)]",
    badge: "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]",
  },
  baja: {
    label: "Baja",
    dot: "bg-[var(--accent-soft)]",
    badge: "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]",
  },
};

const COL_CONFIG: Record<Column, { label: string; color: string; bg: string }> = {
  todo: {
    label: "Por hacer",
    color: "text-[var(--text-secondary)]",
    bg: "bg-[var(--surface-sunken)]/60",
  },
  doing: {
    label: "En proceso",
    color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
  },
  done: {
    label: "Listo",
    color: "text-[var(--data-success-500)] dark:text-[var(--data-success-500)]",
    bg: "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]",
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-primary" />
          <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">
            Tablero de Tareas
          </SectionTitle>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowReset((s) => !s)}
            className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] dark:hover:text-[var(--data-error-500)] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Limpiar completadas
          </button>
          <button
            onClick={() => { setShowForm((s) => !s); setEditingId(null); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              showForm
                ? "bg-[var(--surface-sunken)] text-[var(--text-secondary)]"
                : "bg-primary hover:bg-[#235c43] text-white"
            )}
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "Cancelar" : "Nueva tarea"}
          </button>
        </div>
      </div>

      {/* Confirmacion reset */}
      {showReset && (
        <div className="rounded-lg border border-[var(--data-error-500)] dark:border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10 px-4 py-3 flex items-center justify-between gap-3">
          <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
            Esto eliminara todas las tareas en &ldquo;Listo&rdquo;. Continuar?
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={resetDone}
              className="px-3 py-1 rounded-lg bg-[var(--data-error-500)] text-white text-xs font-medium hover:bg-[var(--data-error-500)] transition-colors"
            >
              Eliminar
            </button>
            <button
              onClick={() => setShowReset(false)}
              className="px-3 py-1 rounded-lg border border-[var(--rule-base)] text-xs text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="rounded-xl border border-primary/30 bg-[var(--surface-raised)] p-4 space-y-3">
          <p className="text-sm font-medium text-[var(--text-secondary)]">Nueva tarea</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Titulo de la tarea"
              className="sm:col-span-3 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="text"
              value={form.assignedTo}
              onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
              placeholder="Asignado a"
              className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <select
              value={form.priority}
              onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
              className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="urgente">Urgente</option>
              <option value="normal">Normal</option>
              <option value="baja">Baja</option>
            </select>
            <button
              onClick={addTask}
              disabled={!form.title.trim()}
              className="rounded-lg bg-primary hover:bg-[#235c43] text-white text-sm font-medium py-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            <div key={col} className={cn("rounded-xl border border-[var(--rule-base)] overflow-hidden", bg)}>
              {/* Header de columna */}
              <div className="px-4 py-3 border-b border-[var(--rule-base)] flex items-center justify-between">
                <span className={cn("font-semibold text-sm", color)}>{label}</span>
                <span className="text-xs text-[var(--text-tertiary)] bg-[var(--surface-raised)] px-2 py-0.5 rounded-full border border-[var(--rule-base)]">
                  {colTasks.length}
                </span>
              </div>

              {/* Tarjetas */}
              <div className="p-3 space-y-2 min-h-32">
                {colTasks.length === 0 && (
                  <div className="flex items-center justify-center h-20 text-xs text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
                    Sin tareas
                  </div>
                )}

                {colTasks.map((task) => {
                  const pCfg = PRIORITY_CONFIG[task.priority];
                  const isEditing = editingId === task.id;

                  return (
                    <div
                      key={task.id}
                      className="rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 space-y-2 "
                    >
                      {isEditing ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={form.title}
                            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                            className="w-full rounded border border-[var(--rule-base)] bg-gray-50 dark:bg-gray-750 px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <input
                            type="text"
                            value={form.assignedTo}
                            onChange={(e) => setForm((f) => ({ ...f, assignedTo: e.target.value }))}
                            className="w-full rounded border border-[var(--rule-base)] bg-gray-50 dark:bg-gray-750 px-2 py-1 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <select
                            value={form.priority}
                            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
                            className="w-full rounded border border-[var(--rule-base)] bg-gray-50 dark:bg-gray-750 px-2 py-1 text-sm text-[var(--text-primary)]"
                          >
                            <option value="urgente">Urgente</option>
                            <option value="normal">Normal</option>
                            <option value="baja">Baja</option>
                          </select>
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => saveEdit(task.id)}
                              className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-primary text-white text-xs"
                            >
                              <Check className="w-3 h-3" />
                              Guardar
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="flex-1 flex items-center justify-center gap-1 py-1 rounded border border-[var(--rule-base)] text-[var(--text-secondary)] text-xs"
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
                            <p className="text-sm font-medium text-[var(--text-primary)] leading-snug">
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
                          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                            <User className="w-3 h-3" />
                            <span>{task.assignedTo}</span>
                            <Clock className="w-3 h-3 ml-auto" />
                            <span>{task.createdAt}</span>
                          </div>

                          {/* Acciones */}
                          <div className="flex items-center gap-1 pt-1 border-t border-[var(--rule-base)]">
                            {PREV_COL[task.column] && (
                              <button
                                onClick={() => moveTask(task.id, "prev")}
                                title="Mover atras"
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)] transition-colors"
                              >
                                <ChevronLeft className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {NEXT_COL[task.column] && (
                              <button
                                onClick={() => moveTask(task.id, "next")}
                                title="Mover adelante"
                                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)] transition-colors"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <div className="flex-1" />
                            <button
                              onClick={() => startEdit(task)}
                              className="p-1 rounded hover:bg-[var(--accent-soft)] dark:hover:bg-[var(--accent-muted)] text-[var(--text-tertiary)] hover:text-[var(--data-success-500)] dark:hover:text-[var(--data-success-500)] transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="p-1 rounded hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] dark:hover:text-[var(--data-error-500)] transition-colors"
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
