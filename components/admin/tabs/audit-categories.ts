import { PlusCircle, Pencil, Trash2, LogIn, Activity } from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";

/**
 * Categorización del audit trail: mapea el string crudo de `action` a una
 * categoría humana con color/ícono del DS. Usado por las cards de resumen y
 * los badges de la tabla del tab Auditoría.
 */

export type AuditCategory = "crear" | "cambiar" | "borrar" | "acceso" | "otro";

export interface CategoryUi {
  label: string;
  icon: LucideIcon;
  /** Clases token para el badge (fondo suave + texto). */
  pill: string;
  /** Color de acento de la card (borde + ícono). */
  accentVar: string;
}

export const CATEGORY_UI: Record<AuditCategory, CategoryUi> = {
  crear: {
    label: "Creaciones",
    icon: PlusCircle,
    pill: "bg-[var(--data-success-50)] text-[var(--data-success-700)]",
    accentVar: "var(--data-success-500)",
  },
  cambiar: {
    label: "Cambios",
    icon: Pencil,
    pill: "bg-[var(--data-info-50)] text-[var(--data-info-700)]",
    accentVar: "var(--data-info-500)",
  },
  borrar: {
    label: "Borrados",
    icon: Trash2,
    pill: "bg-[var(--data-error-50)] text-[var(--data-error-700)]",
    accentVar: "var(--data-error-500)",
  },
  acceso: {
    label: "Accesos",
    icon: LogIn,
    pill: "bg-[var(--accent-soft)] text-[var(--accent-dark)]",
    accentVar: "var(--accent)",
  },
  otro: {
    label: "Otros",
    icon: Activity,
    pill: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
    accentVar: "var(--rule-strong)",
  },
};

/** Orden estable para mostrar las cards. */
export const CATEGORY_ORDER: AuditCategory[] = ["crear", "cambiar", "borrar", "acceso", "otro"];

export function categoryOf(action: string): AuditCategory {
  const a = action.toLowerCase();
  if (a.startsWith("create") || a.startsWith("add")) return "crear";
  if (a.startsWith("update") || a.startsWith("edit") || a.startsWith("patch") || a.startsWith("approve") || a.startsWith("reject"))
    return "cambiar";
  if (a.startsWith("delete") || a.startsWith("remove") || a.startsWith("cancel")) return "borrar";
  if (a.startsWith("login") || a.startsWith("logout") || a.startsWith("auth") || a.includes("session")) return "acceso";
  return "otro";
}

/** Etiqueta legible para acciones conocidas; fallback al string crudo. */
const ACTION_LABELS: Record<string, string> = {
  CREATE: "Creación",
  UPDATE: "Cambio",
  DELETE: "Borrado",
  login_success: "Ingreso",
  login_failed: "Ingreso fallido",
  logout: "Salida",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}
