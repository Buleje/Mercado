"use client";

import { Search } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  ESTADO_LABEL, PERIODOS, SIN_FILTROS,
  type Devolucion, type DevolucionEstado, type FiltrosDevoluciones, type Periodo,
} from "./tipos";

const SELECT = "h-12 min-w-0 rounded-2xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none";

interface Props {
  filtros: FiltrosDevoluciones;
  onCambiar: (f: FiltrosDevoluciones) => void;
  devoluciones: Devolucion[];
  conteos: Record<DevolucionEstado, number>;
  visibles: number;
}

/** Buscador, estado, proveedor y fechas en UNA fila pegada a la lista. */
export function FiltrosDevolucionesBarra({ filtros, onCambiar, devoluciones, conteos, visibles }: Props) {
  const proveedores = [...new Set(devoluciones.map((d) => d.proveedorNombre))].sort((a, b) => a.localeCompare(b, "es"));
  const activos = filtros.estado !== "" || filtros.proveedor !== "" || filtros.periodo !== "" || filtros.texto !== "";
  const poner = (parcial: Partial<FiltrosDevoluciones>) => onCambiar({ ...filtros, ...parcial });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-48 flex-1 basis-56">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input
          type="search"
          aria-label="Buscar devolución"
          placeholder="Buscar proveedor, motivo o producto"
          value={filtros.texto}
          onChange={(e) => poner({ texto: e.target.value })}
          className={cn(SELECT, "w-full pl-9")}
        />
      </div>
      <select aria-label="Estado" value={filtros.estado} onChange={(e) => poner({ estado: e.target.value as DevolucionEstado | "" })} className={SELECT}>
        <option value="">Todos los estados ({devoluciones.length})</option>
        {(Object.keys(ESTADO_LABEL) as DevolucionEstado[]).map((e) => (
          <option key={e} value={e}>{ESTADO_LABEL[e]} ({conteos[e]})</option>
        ))}
      </select>
      <select aria-label="Proveedor" value={filtros.proveedor} onChange={(e) => poner({ proveedor: e.target.value })} className={cn(SELECT, "max-w-56")}>
        <option value="">Todos los proveedores</option>
        {proveedores.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <select aria-label="Fechas" value={filtros.periodo} onChange={(e) => poner({ periodo: e.target.value as Periodo })} className={SELECT}>
        {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>
      {activos && (
        <button type="button" onClick={() => onCambiar(SIN_FILTROS)} className="h-12 px-2 text-sm font-medium text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
          Limpiar ({visibles})
        </button>
      )}
    </div>
  );
}
