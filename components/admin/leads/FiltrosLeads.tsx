"use client";

/**
 * La fila de filtros pegada a la tabla: buscador · estado · canal (cada
 * opción con su cuenta). Todo a 48 px y 14 px, en UNA fila desde `sm`. Antes:
 * el embudo por canal en una caja aparte, un select «Todos los status» y la
 * pastilla «Source: x» en otra banda.
 */
import { Search } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { ESTADOS, ORDEN_ESTADOS, rotuloCanal, type EstadoLead } from "./tipos";

interface Props {
  texto: string;
  onTexto: (t: string) => void;
  estado: EstadoLead | "";
  onEstado: (e: EstadoLead | "") => void;
  /** Cuántos hay en cada estado, sobre la lista entera (no la filtrada). */
  porEstado: Partial<Record<EstadoLead, number>>;
  canal: string;
  onCanal: (c: string) => void;
  /** Canal → cuántos, sobre la lista entera. */
  porCanal: Record<string, number>;
}

const CAMPO = "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]";

export function FiltrosLeads({ texto, onTexto, estado, onEstado, porEstado, canal, onCanal, porCanal }: Props) {
  /* Sólo los estados que tienen a alguien, más el elegido: seis opciones en cero no dicen nada. */
  const estados = ORDEN_ESTADOS.filter((e) => (porEstado[e] ?? 0) > 0 || e === estado);
  const canales = Object.entries(porCanal).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
      <label className="relative min-w-0 grow basis-full sm:basis-60">
        <span className="sr-only">Buscar interesados</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          type="search"
          value={texto}
          onChange={(e) => onTexto(e.target.value)}
          placeholder="Buscar por nombre, negocio o ciudad…"
          className={cn(CAMPO, "w-full pl-9 pr-3 placeholder:text-[var(--text-tertiary)]")}
        />
      </label>

      {/* Estado en un select con su cuenta: seis chips no entraban con el buscador y el canal (1280 px). */}
      <select
        value={estado}
        onChange={(e) => onEstado(e.target.value as EstadoLead | "")}
        aria-label="Filtrar por estado"
        className={cn(CAMPO, "shrink-0 px-3 max-sm:min-w-0 max-sm:flex-1", estado && "border-[var(--accent)]")}
      >
        <option value="">Todos los estados</option>
        {estados.map((e) => (
          <option key={e} value={e}>
            {ESTADOS[e].rotulo} ({porEstado[e] ?? 0})
          </option>
        ))}
      </select>

      {canales.length > 0 && (
        <select
          value={canal}
          onChange={(e) => onCanal(e.target.value)}
          aria-label="Filtrar por canal"
          className={cn(CAMPO, "shrink-0 px-3 max-sm:min-w-0 max-sm:flex-1", canal && "border-[var(--accent)]")}
        >
          <option value="">Todos los canales</option>
          {canales.map(([c, n]) => (
            <option key={c} value={c}>
              {rotuloCanal(c)} ({n})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
