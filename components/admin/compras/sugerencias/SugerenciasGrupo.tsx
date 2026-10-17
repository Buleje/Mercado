"use client";

import { ChevronDown } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import SugerenciaTarjeta from "./SugerenciaTarjeta";
import { URGENCY_CONFIG, type Sugerencia, type Urgency } from "./tipos";

interface Props {
  urgency: Urgency;
  items: Sugerencia[];
  plegado: boolean;
  elegidos: ReadonlySet<number>;
  creandoId: number | null;
  onPlegar: () => void;
  onMarcarTodos: () => void;
  onElegir: (productId: number) => void;
  onCrearOC: (s: Sugerencia) => void;
}

/**
 * Las sugerencias de una urgencia (Críticos, Urgentes, A planificar), plegables.
 * La cabecera es UN botón (antes título y chevron eran dos botones que hacían
 * lo mismo) y «Marcar todos» va a 48 px y 14 px.
 */
export default function SugerenciasGrupo({ urgency, items, plegado, elegidos, creandoId, onPlegar, onMarcarTodos, onElegir, onCrearOC }: Props) {
  const config = URGENCY_CONFIG[urgency];
  const Icon = config.icon;
  const todosMarcados = items.every((i) => elegidos.has(i.productId));
  return (
    <section className={cn("overflow-hidden rounded-2xl border bg-[var(--surface-raised)]", config.border)}>
      <header className={cn("flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4", config.bg)}>
        <button
          type="button"
          onClick={onPlegar}
          aria-expanded={!plegado}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <span className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", config.iconBg)}>
            <Icon className={cn("h-5 w-5", config.text)} strokeWidth={2.2} aria-hidden />
          </span>
          <span className="min-w-0">
            <span className={cn("block text-base font-extrabold", config.text)}>
              {config.short} <span className="tabular-nums">· {items.length}</span>
            </span>
            <span className="block text-sm text-[var(--text-secondary)]">{config.label.split("—")[1]?.trim() ?? config.hint}</span>
          </span>
          <ChevronDown className={cn("ml-auto h-5 w-5 shrink-0 text-[var(--text-secondary)] transition-transform", !plegado && "rotate-180")} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onMarcarTodos}
          className={cn(
            "h-12 shrink-0 rounded-xl px-3 text-sm font-bold transition-colors",
            todosMarcados ? cn(config.text, "hover:underline") : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]",
          )}
        >
          {todosMarcados ? "Quitar todos" : "Marcar todos"}
        </button>
      </header>

      {!plegado && (
        <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
          {items.map((s) => (
            <SugerenciaTarjeta
              key={s.productId}
              s={s}
              config={config}
              elegida={elegidos.has(s.productId)}
              creando={creandoId === s.productId}
              onElegir={() => onElegir(s.productId)}
              onCrearOC={() => onCrearOC(s)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
