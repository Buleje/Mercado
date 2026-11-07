"use client";

import { Search, X } from "@buleje/design-system/icons";
import type { FiltrosPrecios, Sentido } from "./precios-compartido";

const CAMPO = "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)]";

interface Props {
  filtros: FiltrosPrecios;
  onCambiar: (f: FiltrosPrecios) => void;
  productos: number[];
  nombres: Record<number, string>;
  hayFiltros: boolean;
  onLimpiar: () => void;
}

/** Los filtros del historial en UNA fila pegada a la tabla: buscador, producto, fechas y si subió o bajó. */
export default function PreciosFiltros({ filtros, onCambiar, productos, nombres, hayFiltros, onLimpiar }: Props) {
  const set = (parcial: Partial<FiltrosPrecios>) => onCambiar({ ...filtros, ...parcial });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-0 flex-1 basis-56">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          type="search"
          value={filtros.search}
          onChange={(e) => set({ search: e.target.value })}
          placeholder="Producto o usuario"
          aria-label="Buscar por producto o usuario"
          className={`${CAMPO} w-full pl-9`}
        />
      </div>
      <select
        value={filtros.producto}
        onChange={(e) => set({ producto: e.target.value })}
        aria-label="Filtrar por producto"
        className={`${CAMPO} max-w-56`}
      >
        <option value="">Todos los productos</option>
        {productos.map((pid) => (
          <option key={pid} value={pid}>{nombres[pid] ?? `Producto #${pid}`}</option>
        ))}
      </select>
      <input type="date" value={filtros.desde} max={filtros.hasta || undefined} onChange={(e) => set({ desde: e.target.value })} aria-label="Desde" title="Desde" className={CAMPO} />
      <input type="date" value={filtros.hasta} min={filtros.desde || undefined} onChange={(e) => set({ hasta: e.target.value })} aria-label="Hasta" title="Hasta" className={CAMPO} />
      <select value={filtros.sentido} onChange={(e) => set({ sentido: e.target.value as Sentido })} aria-label="Subió o bajó" className={CAMPO}>
        <option value="">Subió y bajó</option>
        <option value="subio">Subió</option>
        <option value="bajo">Bajó</option>
      </select>
      {hayFiltros && (
        <button
          type="button"
          onClick={onLimpiar}
          className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <X className="h-4 w-4" aria-hidden /> Quitar filtros
        </button>
      )}
    </div>
  );
}
