"use client";

import { useState } from "react";
import { ListChecks, Plus, Search } from "@buleje/design-system/icons";
import { EmptyState, LoadingState } from "@buleje/design-system";
import TituloDeVista from "@/components/admin/rrhh/TituloDeVista";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import { filtrarTareas } from "@/lib/admin/tareas-buscar";
import { useTareas } from "@/hooks/use-tareas";
import TareaFormModal from "@/components/admin/tareas/TareaFormModal";
import FilaTarea, { STATUS_META } from "@/components/admin/tareas/FilaTarea";
import { CLASE_CAMPO_TAREA, type Task, type TaskStatus } from "@/components/admin/tareas/tareas-shared";

/* `STATUS_META` vive con la fila (`tareas/FilaTarea`), que es quien lo pinta.
   Cargar, guardar, cambiar de estado y eliminar viven en `hooks/use-tareas`
   (con la defensa contra cargas viejas); el formulario, en `TareaFormModal`. */

export default function TasksTab() {
  const { tareas: tasks, cargando: loading, guardando: saving, guardar, cambiarEstado, eliminar } = useTareas();
  /* La ventana de «Nueva» / «Editar»; `tareaEnEdicion` null = una nueva (se queda al cerrar para no cambiar el título a medio cierre). */
  const [formAbierto, setFormAbierto] = useState(false);
  const [tareaEnEdicion, setTareaEnEdicion] = useState<Task | null>(null);
  const abrirForm = (t: Task | null) => { setTareaEnEdicion(t); setFormAbierto(true); };
  const [filterStatus, setFilterStatus] = useState<TaskStatus | "todas">("todas");
  const [busqueda, setBusqueda] = useState("");

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
        <button type="button" onClick={() => abrirForm(null)} className={button({ variant: "accent" })}>
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
            <FilaTarea key={t.id} tarea={t} onCambiarEstado={(s) => cambiarEstado(t.id, s)} onEditar={() => abrirForm(t)} onEliminar={() => eliminar(t.id)} />
          ))}
        </div>
      )}

      <TareaFormModal open={formAbierto} tarea={tareaEnEdicion} guardando={saving} onClose={() => setFormAbierto(false)} onGuardar={guardar} />
    </div>
  );
}
