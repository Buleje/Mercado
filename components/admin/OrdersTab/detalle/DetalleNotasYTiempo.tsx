"use client";

/**
 * Las dos partes plegables del detalle: las notas internas del equipo y la
 * línea de tiempo del pedido. Salieron de `OrdersDetailPanel.tsx` (10-10).
 */
import { useState, type ReactNode } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { getOrderTimeline } from "@/lib/admin-helpers";
import type { DbOrder } from "@/lib/jsondb";
import { cn } from "@/lib/utils";

function Plegable({
  titulo,
  marca,
  children,
}: {
  titulo: string;
  marca?: ReactNode;
  children: ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="group flex min-h-12 w-full items-center gap-2"
      >
        <ChevronDown
          className={cn(
            "h-4 w-4 text-[var(--text-tertiary)] transition-transform",
            !abierto && "-rotate-90",
          )}
          aria-hidden
        />
        <CardTitle className="text-sm font-bold text-[var(--text-secondary)] transition-colors group-hover:text-[var(--text-primary)]">
          {titulo}
        </CardTitle>
        {marca}
      </button>
      {abierto && <div className="mt-1 space-y-2">{children}</div>}
    </section>
  );
}

interface NotasProps {
  orderId: string;
  notasGuardadas?: string;
  nota: string;
  guardando: boolean;
  onNota: (v: string) => void;
  onGuardar: (orderId: string) => void;
}

export function DetalleNotas({
  orderId,
  notasGuardadas,
  nota,
  guardando,
  onNota,
  onGuardar,
}: NotasProps) {
  return (
    <Plegable
      titulo="Notas internas"
      marca={
        notasGuardadas ? (
          <span className="rounded-full bg-[var(--data-warning-500)]/15 px-2 text-sm font-bold text-[var(--data-warning-ink)]">
            tiene notas
          </span>
        ) : undefined
      }
    >
      {notasGuardadas && (
        <div className="rounded-lg border border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/10 p-3">
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--text-primary)]">
            {notasGuardadas}
          </pre>
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          value={nota}
          onChange={(e) => onNota(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onGuardar(orderId)}
          placeholder="Agregar nota interna…"
          aria-label="Nota interna nueva"
          className="h-12 flex-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-primary"
        />
        <button
          type="button"
          onClick={() => onGuardar(orderId)}
          disabled={guardando || !nota.trim()}
          className={button({ variant: "primary", className: "rounded-xl px-4" })}
        >
          {guardando ? "…" : "Guardar"}
        </button>
      </div>
    </Plegable>
  );
}

export function DetalleLineaDeTiempo({ order }: { order: DbOrder }) {
  return (
    <Plegable titulo="Línea de tiempo">
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <ol className="relative pl-6">
          <span
            aria-hidden
            className="absolute bottom-3 left-2.5 top-3 w-px bg-[var(--rule-base)]"
          />
          {getOrderTimeline(order).map((step) => {
            const Icon = step.icon;
            const cancelado = step.status === "cancelado";
            const hecho = step.completed || step.current;
            return (
              <li key={step.status} className="relative pb-3 last:pb-0">
                <span
                  className={cn(
                    "absolute -left-6 top-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                    hecho
                      ? cancelado
                        ? "border-[var(--data-error-500)] bg-[var(--data-error-500)] text-white"
                        : "border-[var(--data-success-500)] bg-[var(--data-success-500)] text-white"
                      : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)]",
                  )}
                >
                  <Icon className="h-2.5 w-2.5" aria-hidden />
                </span>
                <div className="flex items-baseline justify-between gap-2">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      hecho
                        ? cancelado
                          ? "text-[var(--data-error-ink)]"
                          : "text-[var(--text-primary)]"
                        : "text-[var(--text-tertiary)]",
                    )}
                  >
                    {step.label}
                  </p>
                  {step.timestamp && (
                    <span className="shrink-0 text-sm tabular-nums text-[var(--text-secondary)]">
                      {step.timestamp}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </Plegable>
  );
}
