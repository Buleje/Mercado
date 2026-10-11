"use client";

import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { useState, useEffect, useCallback, useRef } from "react";
import { ListChecks, Plus, Check, Search } from "@buleje/design-system/icons";
import { EmptyState, LoadingState } from "@buleje/design-system";
import TituloDeVista from "@/components/admin/rrhh/TituloDeVista";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { toast } from "sonner";
import { Field } from "@/components/admin/shared/Field";
import { filtrarTareas } from "@/lib/admin/tareas-buscar";
import SelectorEncargado from "@/components/admin/tareas/SelectorEncargado";
import FilaTarea, { STATUS_META } from "@/components/admin/tareas/FilaTarea";
import { CLASE_CAMPO_TAREA, CLASE_ROTULO_TAREA, EMPTY, MODULES, PRIORITY_META, type FormData, type Task, type TaskStatus, type Priority } from "@/components/admin/tareas/tareas-shared";

/* `STATUS_META` vive con la fila (`tareas/FilaTarea`), que es quien lo pinta. */

export default function TasksTab() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "todas">("todas");
  const [busqueda, setBusqueda] = useState("");

  // Una carga que salió antes de un cambio trae la lista vieja. Medido
  // 2026-09-14: el GET del doble montaje llegó 470 ms después del clic en
  // Eliminar y la tarea volvió a la pantalla aunque ya no estaba en la base.
  // Sólo aplica su lista la carga más nueva, y sólo si no hubo cambios mientras
  // viajaba; cada cambio termina con una carga silenciosa que trae lo guardado.
  const cargasRef = useRef({ ultima: 0, cambios: 0 });
  const load = useCallback(async (opciones?: { silenciosa?: boolean }) => {
    const esta = ++cargasRef.current.ultima;
    const cambiosAlSalir = cargasRef.current.cambios;
    if (!opciones?.silenciosa) setLoading(true);
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const lista = (await res.json()) as Task[];
        if (esta === cargasRef.current.ultima && cambiosAlSalir === cargasRef.current.cambios) setTasks(lista);
      }
    } catch { /* silent */ }
    if (esta === cargasRef.current.ultima) setLoading(false);
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
    // null borra el campo al editar; undefined lo dejaba como estaba (ADR-415).
    cargasRef.current.cambios += 1;
    const body = { title: form.title.trim(), description: form.description || null, priority: form.priority, assignedTo: form.assignedTo || null, dueDate: form.dueDate || null, module: form.module || null };
    try {
      const res = editId
        ? await fetch(`/api/tasks/${editId}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) })
        : await fetch("/api/tasks", { method: "POST", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
      // Antes no se miraba la respuesta: si el servidor fallaba, el modal se cerraba igual.
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(errBody.error || `No se pudo guardar la tarea (HTTP ${res.status})`);
        setSaving(false);
        return;
      }
      setShowForm(false);
      await load();
    } catch {
      toast.error("No se pudo guardar la tarea. Revisa tu conexión.");
    }
    setSaving(false);
  };

  /** Cambia en pantalla al toque y vuelve atrás si el servidor no lo guarda. `completedAt` lo pone el servidor. */
  const changeStatus = async (id: string, status: TaskStatus) => {
    cargasRef.current.cambios += 1;
    const previo = tasks.find(t => t.id === id);
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "PATCH", headers: csrfHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const guardada = (await res.json()) as Task;
      setTasks(prev => prev.map(t => t.id === id ? guardada : t));
    } catch {
      if (previo) setTasks(prev => prev.map(t => t.id === id ? previo : t));
      toast.error("No se pudo cambiar el estado. Reintenta.");
    } finally {
      void load({ silenciosa: true });
    }
  };

  const deleteTask = async (id: string) => {
    cargasRef.current.cambios += 1;
    const previas = tasks;
    setTasks(prev => prev.filter(t => t.id !== id));
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE", headers: csrfHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch {
      setTasks(previas);
      toast.error("No se pudo eliminar la tarea. Reintenta.");
    } finally {
      void load({ silenciosa: true });
    }
  };

  const filtered = filtrarTareas(tasks, filterStatus, busqueda);
  const counts = { pendiente: tasks.filter(t => t.status === "pendiente").length, en_progreso: tasks.filter(t => t.status === "en_progreso").length, completada: tasks.filter(t => t.status === "completada").length };

  return (
    <div className="space-y-3">
      {/* El título de la vista con su acción principal en la misma fila
          (Equipo › Tareas; antes, AdminModuleHeader con subtítulo a la vista). */}
      <TituloDeVista
        titulo="Lo que hay que hacer"
        ayuda={{
          what: "Las tareas del equipo: qué hay que hacer, con qué prioridad, para cuándo y a quién le toca.",
          affects: "Una tarea vencida y sin completar sale en rojo. Completarla la saca de Pendientes.",
          example: "«Contar el stock de gaseosas» para Luis, prioridad alta, para el jueves.",
        }}
      >
        <button type="button" onClick={openCreate} className={button({ variant: "accent" })}>
          <Plus className="h-4 w-4" aria-hidden /> Nueva tarea
        </button>
      </TituloDeVista>

      {/* Estado + buscador, en una fila pegada a la lista que filtran. */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
          {([["todas", "Todas"], ["pendiente", `Pendientes (${counts.pendiente})`], ["en_progreso", `En progreso (${counts.en_progreso})`], ["completada", `Completadas (${counts.completada})`]] as [string, string][]).map(([s, label]) => (
            <button
              key={s}
              type="button"
              aria-pressed={filterStatus === s}
              onClick={() => setFilterStatus(s as TaskStatus | "todas")}
              className={button({ variant: "secondary", className: cn("rounded-xl px-4", filterStatus === s && "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]") })}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-72">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="search"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por título o encargado"
            aria-label="Buscar tareas por título o encargado"
            className={cn(CLASE_CAMPO_TAREA, "h-12 pl-9 bg-[var(--surface-raised)]")}
          />
        </label>
      </div>

      {/* Task list */}
      {loading ? (
        <LoadingState message="Cargando las tareas..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={busqueda.trim() ? `Ninguna tarea coincide con «${busqueda.trim()}»` : `No hay tareas${filterStatus !== "todas" ? ` con estado «${STATUS_META[filterStatus].label.toLowerCase()}»` : ""}`}
        />
      ) : (
        /* Una lista, no una tarjeta por tarea: filas separadas por una raya. */
        <div className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {filtered.map(t => (
            <FilaTarea key={t.id} tarea={t} onCambiarEstado={(s) => changeStatus(t.id, s)} onEditar={() => openEdit(t)} onEliminar={() => deleteTask(t.id)} />
          ))}
        </div>
      )}

      {/* Modal */}
      <AdminModal
        open={showForm}
        onClose={() => setShowForm(false)}
        title={editId ? "Editar tarea" : "Nueva tarea"}
        variant="default"
        footer={
          <ModalFooter>
            <button type="button" onClick={() => setShowForm(false)} className={button({ variant: "secondary" })}>Cancelar</button>
            <button type="button" onClick={save} disabled={saving || !form.title.trim()} className={button({ variant: "accent" })}>
              {saving ? "Guardando…" : <><Check className="h-4 w-4" aria-hidden />{editId ? "Guardar" : "Crear tarea"}</>}
            </button>
          </ModalFooter>
        }
      >
        <div className={cn("space-y-4", MODAL_BODY)}>
          <Field label="Título" labelClassName={CLASE_ROTULO_TAREA}>
            <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ej.: contar el stock de gaseosas" className={CLASE_CAMPO_TAREA} />
          </Field>
          <Field label="Descripción (opcional)" labelClassName={CLASE_ROTULO_TAREA}>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className={cn(CLASE_CAMPO_TAREA, "h-auto py-2.5 resize-none")} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Prioridad" labelClassName={CLASE_ROTULO_TAREA}>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as Priority }))} className={CLASE_CAMPO_TAREA}>
                {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </Field>
            <Field label="Módulo" labelClassName={CLASE_ROTULO_TAREA}>
              <select value={form.module} onChange={e => setForm(f => ({ ...f, module: e.target.value }))} className={CLASE_CAMPO_TAREA}>
                <option value="">Sin módulo</option>
                {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectorEncargado value={form.assignedTo} onChange={v => setForm(f => ({ ...f, assignedTo: v }))} />
            <Field label="Fecha límite" labelClassName={CLASE_ROTULO_TAREA}>
              <input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} className={CLASE_CAMPO_TAREA} />
            </Field>
          </div>
        </div>
      </AdminModal>
    </div>
  );
}

