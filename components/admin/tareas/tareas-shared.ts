/** Tipos y catálogos de Tareas, compartidos entre la lista y su formulario. */

export type Priority = "baja" | "media" | "alta" | "urgente";
export type TaskStatus = "pendiente" | "en_progreso" | "completada" | "cancelada";

export interface Task {
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

export const PRIORITY_META: Record<Priority, { label: string; color: string; bg: string }> = {
  baja:     { label: "Baja",    color: "text-[var(--text-secondary)]",   bg: "bg-[var(--rule-soft)]" },
  media:    { label: "Media",   color: "text-[var(--data-success-500)]",   bg: "bg-primary/10" },
  alta:     { label: "Alta",    color: "text-[var(--data-warning-500)]",  bg: "bg-[var(--data-warning-50)]" },
  urgente:  { label: "Urgente", color: "text-[var(--data-error-500)]",    bg: "bg-[var(--data-error-50)]" },
};

export const MODULES = [
  "Inventario", "Pedidos", "Clientes", "Caja", "Proveedores",
  "Compras", "Promociones", "Reportes", "POS", "Otro",
];

export interface FormData { title: string; description: string; priority: Priority; assignedTo: string; dueDate: string; module: string; }
export const EMPTY: FormData = { title: "", description: "", priority: "media", assignedTo: "", dueDate: "", module: "" };

/** Clase de los campos del formulario (antes repetida en cada input). */
export const CLASE_CAMPO_TAREA =
  "w-full px-3 h-11 text-sm rounded-xl border border-[var(--rule-base)] dark:border-card-border bg-[var(--surface-sunken)] text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary transition-all";
export const CLASE_ROTULO_TAREA = "text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-1 block";
