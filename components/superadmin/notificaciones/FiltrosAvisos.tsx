"use client";

import { Layers, Search, X } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";
import { NIVELES, type CategoriaAviso } from "@/lib/superadmin/nivel-aviso";
import type { Conteos, FiltroCategoria, FiltroNivel } from "./filtrar";
import { CATEGORIA_META, NIVEL_META } from "./meta";

const CHIP =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-muted)]";
const CHIP_ACTIVO = "border-transparent bg-[var(--text-primary)] text-[var(--surface-canvas)]";
const CHIP_INACTIVO =
  "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)] hover:text-[var(--text-primary)]";

/** Los chips de nivel con su conteo: Todos · Urgente · Importante · Leve · Informativo. */
export function ChipsNivel({
  valor,
  conteos,
  onCambiar,
}: {
  valor: FiltroNivel;
  conteos: Conteos["porNivel"];
  onCambiar: (n: FiltroNivel) => void;
}) {
  const opciones: FiltroNivel[] = ["todos", ...NIVELES];
  return (
    <div role="group" aria-label="Filtrar por nivel" className="flex flex-wrap gap-1.5">
      {opciones.map((n) => {
        const activo = valor === n;
        const vacio = conteos[n] === 0 && !activo;
        return (
          <button
            key={n}
            type="button"
            aria-pressed={activo}
            data-qa={`nivel-${n}`}
            onClick={() => onCambiar(n)}
            className={cn(CHIP, activo ? CHIP_ACTIVO : CHIP_INACTIVO, vacio && "opacity-60")}
          >
            {n !== "todos" && <span className={cn("h-2 w-2 rounded-full", NIVEL_META[n].punto)} aria-hidden />}
            {n === "todos" ? "Todos" : NIVEL_META[n].etiqueta}
            <span className="tabular-nums font-bold">{conteos[n]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Busca entre los avisos que bajaron: tienda, error, cliente, motivo. */
export function BuscadorAvisos({
  valor,
  onCambiar,
  className,
}: {
  valor: string;
  onCambiar: (q: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("relative block", className)}>
      <span className="sr-only">Buscar avisos</span>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]"
        aria-hidden
      />
      <input
        type="search"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder="Buscar tienda, error o cliente"
        className="h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-9 pr-9 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)] [&::-webkit-search-cancel-button]:hidden"
      />
      {valor && (
        <button
          type="button"
          onClick={() => onCambiar("")}
          aria-label="Borrar búsqueda"
          className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </label>
  );
}

/**
 * Las categorías: riel a la izquierda en desktop, chips que se deslizan a
 * 400 px. Un solo árbol con clases por ancho (no dos copias que se desfasen).
 */
export function RielCategorias({
  valor,
  categorias,
  conteos,
  onCambiar,
}: {
  valor: FiltroCategoria;
  categorias: CategoriaAviso[];
  conteos: Conteos["porCategoria"];
  onCambiar: (c: FiltroCategoria) => void;
}) {
  const opciones: FiltroCategoria[] = ["todas", ...categorias];
  return (
    <nav
      aria-label="Categorías"
      className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-[var(--rule-base)] px-5 py-2.5 sm:w-60 sm:flex-col sm:gap-0.5 sm:overflow-x-visible sm:overflow-y-auto sm:border-b-0 sm:border-r sm:px-3 sm:py-3"
    >
      {opciones.map((c) => {
        const activo = valor === c;
        const meta = c === "todas" ? null : CATEGORIA_META[c];
        const Icono = meta?.icon ?? Layers;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={activo}
            data-qa={`categoria-${c}`}
            onClick={() => onCambiar(c)}
            className={cn(
              CHIP,
              "sm:h-10 sm:w-full sm:rounded-lg sm:border-transparent sm:px-3 sm:text-sm",
              activo
                ? cn(CHIP_ACTIVO, "sm:bg-[var(--accent-soft)] sm:text-[var(--text-primary)]")
                : cn(CHIP_INACTIVO, "sm:bg-transparent sm:hover:bg-[var(--surface-sunken)]"),
              conteos[c] === 0 && !activo && "opacity-60",
            )}
          >
            <Icono
              className={cn("h-4 w-4 shrink-0", activo && "sm:text-[var(--accent-ink)] sm:dark:text-[var(--accent)]")}
              aria-hidden
            />
            <span className="sm:hidden">{meta?.corta ?? "Todas"}</span>
            <span className="hidden min-w-0 truncate text-left sm:inline">{meta?.etiqueta ?? "Todas"}</span>
            <span className="tabular-nums font-bold sm:ml-auto">{conteos[c]}</span>
          </button>
        );
      })}
    </nav>
  );
}
