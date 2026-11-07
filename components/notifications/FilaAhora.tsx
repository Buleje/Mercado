"use client";

/**
 * Una fila de «Para atender ahora» (rediseño 18-10): sin caja ni franja de
 * color. El color queda sólo en el ícono —rojo urgente, coral el resto— y la
 * fila respira dentro del bloque hundido de la sección. Una línea con qué hay
 * que hacer, una con el detalle y una con a quién le toca y desde cuándo; el
 * «cómo se resuelve» va al ⓘ (ley 9: título, dato y acción a la vista).
 *
 * La acción mide 48 px, pero con margen negativo: no estira la fila.
 */
import type { ElementType } from "react";
import { ChevronRight } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";

export interface FilaAhoraProps {
  icono: ElementType;
  urgente: boolean;
  titulo: string;
  detalle?: string;
  /** A quién le toca y desde cuándo, chico. */
  meta?: string;
  /** Cómo se resuelve: va al ⓘ. */
  ayuda?: string;
  accion?: { label: string; onClick: () => void };
  qa?: string;
}

export default function FilaAhora({ icono: Icono, urgente, titulo, detalle, meta, ayuda, accion, qa }: FilaAhoraProps) {
  return (
    <div
      data-qa={qa}
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[var(--surface-raised)]"
    >
      <span
        aria-hidden
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-full",
          urgente ? "bg-[var(--data-error-500)]/12" : "bg-[var(--data-warning-500)]/12",
        )}
      >
        <Icono
          className={cn("h-[1.125rem] w-[1.125rem]", urgente ? "text-[var(--data-error-ink)]" : "text-[var(--data-warning-ink)]")}
          strokeWidth={2}
        />
      </span>
      <div className="flex-1">
        {/* En línea, no flex: a 400 px «Atender 8 pedidos» se cortaba en
            «Atender 8 pe…» por la etiqueta y el ⓘ; ahora la fila baja entera. */}
        <p className="text-sm font-semibold leading-5 text-[var(--text-primary)]">
          <span className="sr-only">{urgente ? "Urgente: " : "Atención: "}</span>
          {titulo}
          {urgente && (
            <span aria-hidden className="ml-1.5 whitespace-nowrap text-xs font-semibold text-[var(--data-error-ink)]">
              Urgente
            </span>
          )}
          {ayuda && <InfoTip title={titulo} what={ayuda} side="bottom" className="-my-1 ml-0.5 align-middle" />}
        </p>
        {detalle && (
          <p className="line-clamp-2 text-sm leading-5 text-[var(--text-secondary)] sm:line-clamp-1" title={detalle}>
            {detalle}
          </p>
        )}
        {meta && <p className="truncate text-xs leading-5 text-[var(--text-tertiary)]">{meta}</p>}
      </div>
      {accion && (
        <button
          type="button"
          onClick={accion.onClick}
          className="-my-1.5 -mr-1.5 inline-flex h-12 shrink-0 items-center gap-0.5 rounded-xl pl-3 pr-2 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] dark:text-[var(--accent)]"
        >
          {accion.label}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
