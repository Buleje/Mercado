"use client";

import AdminModal from "@/components/admin/shared/AdminModal";
import { useState, useEffect, useCallback } from "react";
import { ClipboardList, ListChecks, Plus, Check, Pencil, Trash2, User, Clock, AlertCircle, CheckCircle2, X } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { Field } from "@/components/admin/shared/Field";

type Priority = "baja" | "media" | "alta" | "urgente";
type TaskStatus = "pendiente" | "en_progreso" | "completada" | "cancelada";

interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  status: TaskStatus;
  assignedTo?: string;
  dueDate?: string;
  module?: string;
  createdAt: string;
  completedAt?: string;
}

const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string }> = {
  baja:     { label: "Baja",    color: "text-[var(--text-secondary)]",   bg: "bg-gray-100" },
  media:    { label: "Media",   color: "text-[var(--data-success-500)]",   bg: "bg-primary/10" },
  alta:     { label: "Alta",    color: "text-[var(--data-warning-500)]",  bg: "bg-[var(--data-warning-50)]" },
  urgente:  { label: "Urgente", color: "text-[var(--data-error-500)]",    bg: "bg-[var(--data-error-50)]" },
};

const STATUS_META: Record<TaskStatus, { label: string; color: string; icon: React.ElementType }> = {
  pendiente:    { label: "Pendiente",    color: "text-[var(--text-secondary)]",   icon: Clock },
  en_progreso:  { label: "En progreso",  color: "text-[var(--data-success-500)]",   icon: AlertCircle },
  completada:   { label: "Completada",   color: "text-[var(--data-success-500)]",icon: CheckCircle2 },
  cancelada:    { label: "Cancelada",    color: "text-[var(--data-error-500)]",    icon: X },
};

const MODULES = [
  "Inventario", "Pedidos", "Clientes", "Caja", "Proveedores",
  "Compras", "Promociones", "Reportes", "POS", "Otro",
];

interface FormData { title: string; description: string; priority: Priority; assignedTo: string; dueDate: string; module: string; }
const EMPTY: FormData = { title: "", description: "", priority: "media", assignedTo: "", dueDate: "", module: "" };

export default function TasksTab() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "todas">("todas");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) setTasks(await res.json());
    } catch { /* silent */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openCreate = () => { setForm(EMPTY); setEditId(null); setShowForm(true); };
  const openEdit = (t: Task) => {
    setForm({ title: t.title, description: t.description ?? "", priority: t.priority, assignedTo: t.assignedTo ?? "", dueDate: t.dueDate ?? "", module: t.module ?? "" });
    setEditId(t.id);
    setShowForm(true);
  };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    const body = { title: form.title.trim(), description: form.description || undefined, priority: form.priority, assignedTo: form.assignedTo || undefined, dueDate: form.dueDate || undefined, module: form.module || undefined };
    try {
      if (editId) {
        await fetch(`/api/tasks/${editId}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
      } else {
        await fetch("/api/tasks", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
      }
      setShowForm(false);
      await load();
    } catch { /* silent */ }
    setSaving(false);
  };

  const changeStatus = async (id: string, status: TaskStatus) => {
    await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status, ...(status === "completada" ? { completedAt: new Date().toISOString() } : {}) }) });
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };

  const deleteTask = async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: "DELETE" });
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const filtered = filterStatus === "todas" ? tasks : tasks.filter(t => t.status === filterStatus);
  const counts = { pendiente: tasks.filter(t => t.status === "pendiente").length, en_progreso: tasks.filter(t => t.status === "en_progreso").length, completada: tasks.filter(t => t.status === "completada").length };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* El título de la pantalla vive acá (antes era un h2 y el hub tenía que
          poner el suyo): AdminModuleHeader ya resuelve el responsive del
          encabezado + acciones. */}
      <AdminModuleHeader
        title="Tareas & Asignaciones"
        description="Coordina el trabajo del equipo"
        icon={ClipboardList}
        noBorder
      >
        <button onClick={openCreate} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
          <Plus className="h-4 w-4" /> Nueva Tarea
        </button>
      </AdminModuleHeader>

      {/* Status filter tabs */}
      <div className="flex items-center gap-1.5">
        {([["todas", "Todas"], ["pendiente", `Pendientes (${counts.pendiente})`], ["en_progreso", `En progreso (${counts.en_progreso})`], ["completada", `Completadas (${counts.completada})`]] as [string, string][]).map(([s, label]) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s as TaskStatus | "todas")}
            className={cn("px-3 py-1.5 rounded-xl text-xs font-bold transition-all border",
              filterStatus === s ? "bg-primary text-white border-transparent " : "bg-white dark:bg-card text-[var(--text-secondary)] dark:text-muted border-[var(--rule-base)] dark:border-card-border hover:border-gray-300"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="h-40 flex items-center justify-center text-[var(--text-tertiary)] dark:text-muted">Cargando…</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-card border-2 border-dashed border-[var(--rule-base)] dark:border-card-border rounded-xl p-12 text-center">
          <ListChecks className="h-12 w-12 text-[var(--text-tertiary)] dark:text-muted mx-auto mb-3" />
          <p className="text-[var(--text-secondary)] dark:text-muted font-semibold">No hay tareas{filterStatus !== "todas" ? ` con estado "${filterStatus}"` : ""}</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map(t => {
            const pm = PRIORITY_META[t.priority];
            const sm = STATUS_META[t.status];
            const StatusIcon = sm.icon;
            return (
              <div
                key={t.id}
                className={cn(
                  "bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4 hover:shadow-sm transition-shadow",
                  t.status === "completada" && "opacity-70"
                )}
              >
                <div className="flex flex-wrap items-start gap-3">
                  {/* Status toggle */}
                  <button
                    onClick={() => changeStatus(t.id, t.status === "completada" ? "pendiente" : "completada")}
                    className={cn("mt-0.5 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all",
                      t.status === "completada" ? "border-[var(--data-success-500)]/30 bg-primary/10" : "border-[var(--rule-base)] dark:border-card-border hover:border-[var(--data-success-500)]/30"
                    )}
                  >
                    {t.status === "completada" && <Check className="h-3 w-3 text-white" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className={cn("font-semibold text-sm text-[var(--text-primary)] dark:text-foreground", t.status === "completada" && "line-through text-[var(--text-tertiary)]")}>{t.title}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEdit(t)} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors">
                          <Pencil className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                        </button>
                        <button onClick={() => deleteTask(t.id)} className="p-1 rounded-lg hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 transition-colors">
                          <Trash2 className="h-3.5 w-3.5 text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]" />
                        </button>
                      </div>
                    </div>
                    {t.description && <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5 line-clamp-2">{t.description}</p>}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className={cn("px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold", pm.bg, pm.color)}>{pm.label}</span>
                      <span className={cn("flex items-center gap-1 text-[length:var(--ts-2xs)] font-semibold", sm.color)}>
                        <StatusIcon className="h-3 w-3" />{sm.label}
                      </span>
                      {t.assignedTo && (
                        <span className="flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">
                          <User className="h-3 w-3" />{t.assignedTo}
                        </span>
                      )}
                      {t.module && <span className="text-[length:var(--ts-2xs)] bg-primary/10 dark:bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] px-2 py-0.5 rounded-full font-semibold">{t.module}</span>}
                      {t.dueDate && (
                        <span className={cn("flex items-center gap-1 text-[length:var(--ts-2xs)]", new Date(t.dueDate) < new Date() && t.status !== "completada" ? "text-[var(--data-error-500)] font-bold" : "text-[var(--text-tertiary)] dark:text-muted")}>
                          <Clock className="h-3 w-3" />{new Date(t.dueDate).toLocaleDateString("es-PE")}
                        </span>
                      )}
                    </div>
                    {/* Status change dropdown */}
                    {t.status !== "completada" && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Cambiar estado:</span>
                        {(["pendiente", "en_progreso", "completada"] as TaskStatus[]).filter(s => s !== t.status).map(s => (
                          <button key={s} onClick={() => changeStatus(t.id, s)}
                            className="text-[length:var(--ts-2xs)] px-2 py-0.5 rounded-full border border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)] dark:text-muted hover:bg-gray-50 dark:hover:bg-surface transition-colors">
                            {STATUS_META[s].label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <AdminModal open={showForm} onClose={() => setShowForm(false)} title={editId ? "Editar tarea" : "Nueva tarea"} variant="default">
        <div className="p-5 space-y-4">
          <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Título de la tarea" className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-surface text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all" />
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descripción (opcional)" rows={2} className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-surface text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all resize-none" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Prioridad" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-1 block">
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Priority }))} className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-surface text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary transition-all">
                {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Módulo" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-1 block">
              <select value={form.module} onChange={e => setForm(f => ({ ...f, module: e.target.value }))} className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-surface text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary transition-all">
                <option value="">Sin módulo</option>
                {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Asignado a" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-1 block">
              <input type="text" value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} placeholder="Nombre del encargado" className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-surface text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary transition-all" />
            </Field>
            <Field label="Fecha límite" labelClassName="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-1 block">
              <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-gray-50 dark:bg-surface text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary transition-all" />
            </Field>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-[var(--text-primary)] dark:text-foreground text-sm font-semibold hover:bg-gray-50 dark:hover:bg-surface transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving || !form.title.trim()} className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-60 flex flex-wrap items-center justify-center gap-2 transition-colors">
              {saving ? "Guardando…" : <><Check className="h-4 w-4" />{editId ? "Guardar" : "Crear tarea"}</>}
            </button>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

