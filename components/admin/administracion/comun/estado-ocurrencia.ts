/**
 * Cómo se ve cada estado de una actividad en un día (ADR-501 §3): el mismo
 * rótulo, ícono y color en Hoy, en la grilla del mes y en el panel del día.
 * Sólo tokens del DS (`--data-*-50` fondo + `-ink` texto; `-500` en puntos).
 */
import {
  Ban,
  CheckCircle2,
  Circle,
  CircleDot,
  Clock,
  SkipForward,
  TriangleAlert,
  type LucideIcon,
} from "@buleje/design-system/icons";
import type { ColorAgenda, EstadoOcurrencia } from "@/lib/agenda/tipos";

export interface EstiloEstado {
  label: string;
  icon: LucideIcon;
  /** Fondo + texto del chip. */
  chip: string;
  /** Punto o barra (fondo sólido). */
  punto: string;
  /** Texto del ícono suelto. */
  texto: string;
}

const NEUTRO = {
  chip: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  punto: "bg-[var(--text-tertiary)]",
  texto: "text-[var(--text-tertiary)]",
};

export const ESTILO_ESTADO: Record<EstadoOcurrencia, EstiloEstado> = {
  hecha: {
    label: "Hecha",
    icon: CheckCircle2,
    chip: "bg-[var(--data-success-50)] text-[var(--data-success-ink)]",
    punto: "bg-[var(--data-success-500)]",
    texto: "text-[var(--data-success-600)] dark:text-[var(--data-success-500)]",
  },
  parcial: {
    label: "A medias",
    icon: CircleDot,
    chip: "bg-[var(--data-info-50)] text-[var(--data-info-ink)]",
    punto: "bg-[var(--data-info-500)]",
    texto: "text-[var(--data-info-600)] dark:text-[var(--data-info-500)]",
  },
  pendiente: {
    label: "Por hacer",
    icon: Circle,
    chip: "bg-[var(--accent-muted)] text-[var(--accent-ink)] dark:text-[var(--accent)]",
    punto: "bg-[var(--accent)]",
    texto: "text-[var(--accent-ink)] dark:text-[var(--accent)]",
  },
  atrasada: {
    label: "Atrasada",
    icon: TriangleAlert,
    chip: "bg-[var(--data-error-50)] text-[var(--data-error-ink)]",
    punto: "bg-[var(--data-error-500)]",
    texto: "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]",
  },
  futura: { label: "Más adelante", icon: Clock, ...NEUTRO },
  omitida: { label: "No tocaba", icon: Ban, ...NEUTRO },
  pospuesta: {
    label: "Pospuesta",
    icon: SkipForward,
    chip: "bg-[var(--data-warning-50)] text-[var(--data-warning-ink)]",
    punto: "bg-[var(--data-warning-500)]",
    texto: "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]",
  },
};

/** El color que el dueño le puso a la actividad, como punto. */
export const PUNTO_COLOR: Record<ColorAgenda, string> = {
  info: "bg-[var(--data-info-500)]",
  success: "bg-[var(--data-success-500)]",
  warning: "bg-[var(--data-warning-500)]",
  error: "bg-[var(--data-error-500)]",
  neutral: "bg-[var(--text-tertiary)]",
};

export const NOMBRE_COLOR: Record<ColorAgenda, string> = {
  info: "Azul",
  success: "Verde",
  warning: "Ámbar",
  error: "Rojo",
  neutral: "Gris",
};

/** Lo que ya no pide nada hoy: hecha, omitida o pospuesta a otro día. */
export const estaResuelta = (estado: EstadoOcurrencia): boolean =>
  estado === "hecha" || estado === "omitida" || estado === "pospuesta";
