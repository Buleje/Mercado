"use client";

/** Una fila: buscador + estado (segmentado con su conteo), 48 px y texto ≥14 px. */
import { Search } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { FiltroEstado } from "./use-guias";
import { CAMPO_ICONO } from "./estilos";
import { STATUS_META, type GuiaStatus } from "./tipos";

const ESTADOS: readonly FiltroEstado[] = ["", "BORRADOR", "EMITIDA", "EN_TRANSITO", "ENTREGADA", "ANULADA"];

interface Props {
  search: string;
  onSearch: (v: string) => void;
  estado: FiltroEstado;
  onEstado: (e: FiltroEstado) => void;
  conteos: Record<string, number>;
}

export function GuiasFiltros({ search, onSearch, estado, onEstado, conteos }: Props) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          type="search"
          placeholder="Buscar por destinatario…"
          aria-label="Buscar guías de remisión"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className={CAMPO_ICONO}
        />
      </div>
      <div className="min-w-0 max-w-full overflow-x-auto scrollbar-none">
        <div role="group" aria-label="Filtrar por estado" className="flex w-max items-center gap-1 rounded-xl bg-[var(--surface-sunken)]">
          {ESTADOS.map((s) => {
            const elegido = estado === s;
            return (
              <button
                key={s || "todos"}
                type="button"
                aria-pressed={elegido}
                onClick={() => onEstado(s)}
                className={cn(
                  "inline-flex min-h-12 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition-colors",
                  elegido
                    ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--rule-base)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                )}
              >
                {s === "" ? "Todos" : STATUS_META[s as GuiaStatus].label}
                <span className="tabular-nums text-[var(--text-tertiary)]">{conteos[s] ?? 0}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
