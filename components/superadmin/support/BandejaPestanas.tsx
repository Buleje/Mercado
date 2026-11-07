"use client";

/**
 * «Mensajes» | «Correcciones de guía» (ADR-512): dos pestañas sobre la misma
 * lista de soporte. El número es lo que falta atender (no cerradas).
 */

import { FileWarning, Mail } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { Bandeja } from "./shared";

const PESTANAS: { id: Bandeja; label: string; icon: typeof Mail }[] = [
  { id: "mensajes", label: "Mensajes", icon: Mail },
  { id: "correcciones", label: "Correcciones de guía", icon: FileWarning },
];

export default function BandejaPestanas({
  valor,
  onCambiar,
  mensajes,
  correcciones,
}: {
  valor: Bandeja;
  onCambiar: (b: Bandeja) => void;
  mensajes: number;
  correcciones: number;
}) {
  const cuenta: Record<Bandeja, number> = { mensajes, correcciones };
  return (
    <div role="tablist" aria-label="Bandeja de soporte" className="grid grid-cols-2 gap-1 rounded-xl bg-[var(--surface-sunken)] p-1">
      {PESTANAS.map(({ id, label, icon: Icon }) => {
        const activa = valor === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activa}
            onClick={() => onCambiar(id)}
            className={cn(
              "flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition-colors",
              activa
                ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 text-left leading-tight">{label}</span>
            {cuenta[id] > 0 && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                {cuenta[id]}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
