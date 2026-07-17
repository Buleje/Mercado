"use client";

import { Tag } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Etiquetas de triage del inbox (single source) ─────────────────────────────
// Colores vía tokens del DS — sin hex. Compartidas entre lista, picker y filtro.

export type WaLabelDef = {
  id: string;
  nombre: string;
  /** Clases del chip activo (bg suave + texto fuerte del token). */
  chip: string;
  /** Punto de color para la lista. */
  dot: string;
};

export const WA_LABELS: WaLabelDef[] = [
  {
    id: "nuevo",
    nombre: "Nuevo",
    chip: "bg-[var(--data-info-100)] text-[var(--data-info-700)]",
    dot: "bg-[var(--data-info-500)]",
  },
  {
    id: "pedido",
    nombre: "Pedido",
    chip: "bg-primary/15 text-primary",
    dot: "bg-primary",
  },
  {
    id: "pagado",
    nombre: "Pagado",
    chip: "bg-[var(--data-success-100)] text-[var(--data-success-700)]",
    dot: "bg-[var(--data-success-500)]",
  },
  {
    id: "pendiente",
    nombre: "Pendiente",
    chip: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]",
    dot: "bg-[var(--data-warning-500)]",
  },
  {
    id: "reclamo",
    nombre: "Reclamo",
    chip: "bg-[var(--data-error-100)] text-[var(--data-error-500)]",
    dot: "bg-[var(--data-error-500)]",
  },
  {
    id: "vip",
    nombre: "VIP ⭐",
    chip: "bg-slate-900 text-white dark:bg-white dark:text-slate-900",
    dot: "bg-slate-900 dark:bg-white",
  },
];

export function labelDef(id: string): WaLabelDef | undefined {
  return WA_LABELS.find((l) => l.id === id);
}

/** Chips compactos para las filas de la lista. */
export function WaLabelChips({ labels }: { labels: string[] }) {
  if (!labels.length) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {labels.map((id) => {
        const def = labelDef(id);
        if (!def) return null;
        return (
          <span
            key={id}
            title={def.nombre}
            className={cn("inline-block h-2.5 w-2.5 rounded-full", def.dot)}
          />
        );
      })}
    </span>
  );
}

/** Picker del hilo: toggle de cada etiqueta con un click. */
export function WaLabelPicker({
  value,
  onToggle,
}: {
  value: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Tag className="h-3.5 w-3.5 text-slate-400" aria-hidden />
      {WA_LABELS.map((l) => {
        const active = value.includes(l.id);
        return (
          <button
            key={l.id}
            type="button"
            onClick={() => onToggle(l.id)}
            className={cn(
              "rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold transition",
              active
                ? l.chip
                : "bg-slate-100 text-slate-400 hover:text-slate-600 dark:bg-slate-800 dark:hover:text-slate-300",
            )}
            title={active ? `Quitar etiqueta ${l.nombre}` : `Etiquetar como ${l.nombre}`}
          >
            {l.nombre}
          </button>
        );
      })}
    </div>
  );
}
