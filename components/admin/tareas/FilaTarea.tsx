"use client";

/**
 * FilaTarea — una tarea en la lista de Equipo › Tareas (noche 11-10).
 *
 * Patrón del panel: una fila de la lista (sin tarjeta propia) con la casilla
 * de completar como acción principal y «⋯» con lo demás (editar, cambiar de
 * estado, eliminar). Antes cada tarjeta llevaba dos íconos de 32 px arriba,
 * una fila «Cambiar estado:» con dos botones y los datos a 10 px.
 */

import { AlertCircle, CheckCircle2, Clock, MoreHorizontal, Pencil, Trash2, User, X, type LucideIcon } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { Casilla } from "@/components/ui-system/Casilla";
import { fechaParaMostrar } from "@/lib/admin/metas-tareas";
import { cn, limaDateKey } from "@/lib/utils";
import { PRIORITY_META, type Task, type TaskStatus } from "./tareas-shared";

export const STATUS_META: Record<TaskStatus, { label: string; color: string; icon: LucideIcon }> = {
  pendiente: { label: "Pendiente", color: "text-[var(--text-secondary)]", icon: Clock },
  en_progreso: { label: "En progreso", color: "text-[var(--data-success-ink)]", icon: AlertCircle },
  completada: { label: "Completada", color: "text-[var(--data-success-ink)]", icon: CheckCircle2 },
  cancelada: { label: "Cancelada", color: "text-[var(--data-error-ink)]", icon: X },
};

interface Props {
  tarea: Task;
  onCambiarEstado: (estado: TaskStatus) => void;
  onEditar: () => void;
  onEliminar: () => void;
}

export default function FilaTarea({ tarea: t, onCambiarEstado, onEditar, onEliminar }: Props) {
  const pm = PRIORITY_META[t.priority];
  const sm = STATUS_META[t.status];
  const IconoEstado = sm.icon;
  const hecha = t.status === "completada";
  const vencida = Boolean(t.dueDate && t.dueDate < limaDateKey() && !hecha);
  const acciones: MenuAccion[] = [
    { id: "editar", label: "Editar", icon: Pencil, onSelect: onEditar },
    ...(["pendiente", "en_progreso", "completada"] as TaskStatus[])
      .filter((s) => s !== t.status)
      .map((s) => ({ id: s, label: `Pasar a «${STATUS_META[s].label}»`, icon: STATUS_META[s].icon, seccion: "Estado", onSelect: () => onCambiarEstado(s) })),
    { id: "eliminar", label: "Eliminar", icon: Trash2, tone: "danger" as const, onSelect: onEliminar },
  ];

  return (
    <div className={cn("flex items-start gap-2 px-2 py-2", hecha && "opacity-70")}>
      {/* Completar o reabrir: la casilla del DS, con 48 px de dedo alrededor. */}
      <label className="grid h-12 w-12 shrink-0 cursor-pointer place-items-center">
        <Casilla checked={hecha} onChange={() => onCambiarEstado(hecha ? "pendiente" : "completada")} aria-label={hecha ? `Reabrir «${t.title}»` : `Completar «${t.title}»`} />
      </label>

      <div className="min-w-0 flex-1 py-1.5">
        <p className={cn("text-sm font-semibold text-[var(--text-primary)]", hecha && "text-[var(--text-tertiary)] line-through")}>{t.title}</p>
        {t.description && <p className="mt-0.5 line-clamp-2 text-sm text-[var(--text-secondary)]">{t.description}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className={cn("rounded-full px-2 py-0.5 font-semibold", pm.bg, pm.color)}>{pm.label}</span>
          <span className={cn("inline-flex items-center gap-1 font-semibold", sm.color)}>
            <IconoEstado className="h-4 w-4" aria-hidden />
            {sm.label}
          </span>
          {t.assignedTo && (
            <span className="inline-flex items-center gap-1 text-[var(--text-tertiary)]">
              <User className="h-4 w-4" aria-hidden />
              {t.assignedTo}
            </span>
          )}
          {t.module && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">{t.module}</span>}
          {t.dueDate && (
            <span className={cn("inline-flex items-center gap-1", vencida ? "font-bold text-[var(--data-error-ink)]" : "text-[var(--text-tertiary)]")}>
              <Clock className="h-4 w-4" aria-hidden />
              {fechaParaMostrar(t.dueDate)}
            </span>
          )}
        </div>
      </div>

      <ActionMenu label={`Más de «${t.title}»`} icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Editar, cambiar de estado o eliminar" />
    </div>
  );
}
