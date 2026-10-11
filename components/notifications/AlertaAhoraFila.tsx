"use client";

/**
 * Una fila de «Para atender ahora»: estado de hoy (stock bajo, pedidos
 * pendientes, lotes por vencer…), no un aviso guardado — por eso no se marca
 * como leída: desaparece sola cuando se resuelve.
 */
import { AlertTriangle, Clock } from "@buleje/design-system/icons";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { cn } from "@/lib/utils";
import type { AlertaAhora } from "./use-alertas-consolidadas";

interface Props {
  alerta: AlertaAhora;
  /** Se llamó al navegar (el modal se cierra). */
  onNavegar: () => void;
}

export default function AlertaAhoraFila({ alerta, onNavegar }: Props) {
  const urgente = alerta.severity === "critical";
  const Icono = alerta.categoria === "sistema" ? Clock : AlertTriangle;
  return (
    <div
      className={cn(
        /* `flex-wrap`: en una columna angosta (la de la derecha del centro, o
           400 px) la acción baja a su propia línea en vez de apretar el texto. */
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-l-4 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2",
        urgente ? "border-l-[var(--data-error-500)]" : "border-l-[var(--data-warning-500)]",
      )}
    >
      <span
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
          urgente ? "bg-[var(--data-error-500)]/10" : "bg-[var(--data-warning-500)]/10",
        )}
        aria-hidden
      >
        <Icono
          className={cn(
            "h-5 w-5",
            urgente ? "text-[var(--data-error-ink)]" : "text-[var(--data-warning-ink)]",
          )}
        />
      </span>
      {/* `grow basis-48`, no `min-w-*` + `flex-1`: el `* { min-width: 0 }` de
          globals.css lo anula y con base 0 la acción nunca bajaba de línea. */}
      <div className="grow basis-48">
        <p className="text-sm font-bold leading-snug text-[var(--text-primary)]">
          <span className="sr-only">{urgente ? "Urgente: " : "Atención: "}</span>
          {alerta.title}
        </p>
        <p className="text-sm text-[var(--text-secondary)]">{alerta.description}</p>
      </div>
      {alerta.action && (
        <button
          type="button"
          onClick={() => {
            if (!alerta.action) return;
            irAEnlace(alerta.action.href);
            onNavegar();
          }}
          className="ml-auto inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] dark:text-[var(--accent)]"
        >
          {alerta.action.label}
          <span aria-hidden>→</span>
        </button>
      )}
    </div>
  );
}
