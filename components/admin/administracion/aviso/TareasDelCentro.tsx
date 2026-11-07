"use client";

/**
 * TareasDelCentro — las tareas del equipo dentro de «Pendientes y avisos»
 * (Brandon 22-10: «agregar tareas, editar, modificar, eliminar y otras
 * funciones completas ahí mismo»). Es la misma lista de Equipo › Tareas
 * (`useTareas` + `FilaTarea`): buscar, filtrar, completar con la casilla,
 * cambiar de estado, editar y eliminar (con confirmación) sin salir del centro.
 *
 * La ventana de «Nueva» / «Editar» la pinta el centro (`ventanas-del-centro`),
 * porque también la abre el menú «Agregar».
 */
import { useState } from "react";
import { ListChecks, Plus, Search } from "@buleje/design-system/icons";
import { EmptyState, LoadingState } from "@buleje/design-system";
import { claseChip } from "@/components/admin/planificacion/piezas/clases";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import FilaTarea from "@/components/admin/tareas/FilaTarea";
import { CLASE_CAMPO_TAREA, type Task } from "@/components/admin/tareas/tareas-shared";
import { button } from "@/components/ui-system/button-variants";
import type { Tareas } from "@/hooks/use-tareas";
import { filtrarTareas, ordenarPorUrgencia } from "@/lib/admin/tareas-buscar";
import { cn } from "@/lib/utils";

type Filtro = "abiertas" | "completadas" | "todas";

/** Lo que cuenta como «abierta»: lo que todavía falta hacer. */
export const esAbierta = (t: Pick<Task, "status">): boolean => t.status === "pendiente" || t.status === "en_progreso";

interface Props {
  api: Tareas;
  onNueva: () => void;
  onEditar: (t: Task) => void;
}

export function TareasDelCentro({ api, onNueva, onEditar }: Props) {
  const { confirm } = useConfirm();
  const [filtro, setFiltro] = useState<Filtro>("abiertas");
  const [busqueda, setBusqueda] = useState("");
  const { tareas } = api;

  const abiertas = tareas.filter(esAbierta).length;
  const completadas = tareas.filter((t) => t.status === "completada").length;
  const coincidentes = filtrarTareas(tareas, "todas", busqueda);
  const lista =
    filtro === "abiertas" ? ordenarPorUrgencia(coincidentes.filter(esAbierta)) : filtro === "completadas" ? coincidentes.filter((t) => t.status === "completada") : coincidentes;
  const buscando = busqueda.trim().length > 0;

  const eliminar = async (t: Task) => {
    const ok = await confirm({
      title: `¿Eliminar «${t.title}»?`,
      description: "Se borra para todo el equipo.",
      intent: "danger",
      confirmLabel: "Eliminar",
    });
    if (ok) await api.eliminar(t.id);
  };

  const filtros: [Filtro, string][] = [
    ["abiertas", `Abiertas (${abiertas})`],
    ["completadas", `Completadas (${completadas})`],
    ["todas", `Todas (${tareas.length})`],
  ];

  return (
    <div className="space-y-3" data-qa="centro-tareas">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Filtrar tareas" className="flex flex-wrap gap-2">
          {filtros.map(([id, etiqueta]) => (
            <button key={id} type="button" aria-pressed={filtro === id} onClick={() => setFiltro(id)} className={claseChip(filtro === id)}>
              {etiqueta}
            </button>
          ))}
        </div>
        <button type="button" data-qa="centro-nueva-tarea" className={button({ variant: "accent", className: "ml-auto" })} onClick={onNueva}>
          <Plus className="size-4" aria-hidden="true" />
          Nueva tarea
        </button>
      </div>

      <label className="relative block">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar por título o encargado"
          aria-label="Buscar tareas por título o encargado"
          className={cn(CLASE_CAMPO_TAREA, "h-12 bg-[var(--surface-raised)] pl-9")}
        />
      </label>

      {api.cargando ? (
        <LoadingState message="Trayendo las tareas…" />
      ) : lista.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={buscando ? `Ninguna tarea coincide con «${busqueda.trim()}»` : filtro === "abiertas" ? "No tienes tareas abiertas" : filtro === "completadas" ? "Todavía no hay tareas completadas" : "Todavía no hay tareas"}
          description={buscando || filtro !== "abiertas" ? undefined : "Crea una con «Nueva tarea»."}
        />
      ) : (
        <div className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {lista.map((t) => (
            <FilaTarea key={t.id} tarea={t} onCambiarEstado={(s) => void api.cambiarEstado(t.id, s)} onEditar={() => onEditar(t)} onEliminar={() => void eliminar(t)} />
          ))}
        </div>
      )}
    </div>
  );
}
