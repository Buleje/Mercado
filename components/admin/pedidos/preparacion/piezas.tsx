"use client";

/**
 * Piezas chicas que comparten Preparación y Análisis: el chip de la etapa, los
 * números de pedido que abren su ficha y el estado vacío.
 */

import type { ComponentType } from "react";
import { cn } from "@/lib/utils";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { numeroPedido, ROTULO_ETAPA, type EtapaPrep } from "@/lib/pedidos/preparacion";

const TONO_ETAPA: Record<EtapaPrep, string> = {
  "sin-empezar": "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  "en-curso": "bg-[var(--data-info-50)] text-[var(--data-info-ink)]",
  listo: "bg-[var(--data-success-50)] text-[var(--data-success-ink)]",
  "listo-parcial": "bg-[var(--data-warning-50)] text-[var(--data-warning-ink)]",
};

export function ChipEtapa({ etapa }: { etapa: EtapaPrep }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", TONO_ETAPA[etapa])}>
      {ROTULO_ETAPA[etapa]}
    </span>
  );
}

/**
 * Los números de pedido de una cifra: cada uno abre su ficha (la ventana de
 * Pedidos, `?pedido=`). Muestra los primeros `max` y dice cuántos más hay.
 */
export function NumerosDePedido({
  ids,
  total,
  max = 6,
  etiqueta,
}: {
  ids: readonly { id: string; extra?: string }[];
  /** Cuántos son en total (puede ser más que `ids`, que viene recortado). */
  total?: number;
  max?: number;
  etiqueta?: string;
}) {
  const ficha = useFichaEnUrl("pedido");
  const visibles = ids.slice(0, max);
  const resto = (total ?? ids.length) - visibles.length;
  return (
    <span className="flex flex-wrap items-center gap-1" aria-label={etiqueta}>
      {visibles.map(({ id, extra }) => (
        <button
          key={id}
          type="button"
          onClick={() => ficha.abrir(id)}
          className="inline-flex min-h-8 items-center rounded-lg border border-[var(--rule-base)] px-2 font-mono text-xs text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-[var(--accent)]"
          title="Abrir el pedido"
          data-qa="pedido-numero"
        >
          {numeroPedido(id)}
          {extra && <span className="ml-1 font-sans text-[var(--text-secondary)]">{extra}</span>}
        </button>
      ))}
      {resto > 0 && <span className="text-xs text-[var(--text-tertiary)]">y {resto} más</span>}
    </span>
  );
}

export function Vacio({ icono: Icono, texto }: { icono: ComponentType<{ className?: string }>; texto: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-10 text-center">
      <Icono className="h-8 w-8 text-[var(--text-tertiary)]" aria-hidden />
      <p className="text-sm text-[var(--text-secondary)]">{texto}</p>
    </div>
  );
}

export function ErrorCarga({ texto, onReintentar }: { texto: string; onReintentar: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-8 text-center">
      <p className="text-sm text-[var(--data-error-ink)]">{texto}</p>
      <button
        type="button"
        onClick={onReintentar}
        className="min-h-12 rounded-xl px-4 text-sm font-semibold text-[var(--accent-ink)] hover:bg-primary/10 dark:text-[var(--accent)]"
      >
        Reintentar
      </button>
    </div>
  );
}
