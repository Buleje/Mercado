"use client";

/**
 * FiltrosPersonal — buscador, puesto y estado de «Las personas del negocio».
 *
 * Van en la fila del título (Brandon 23-10: «en esa fila tiene que estar lo de
 * abajo… filtros y demás»), en el slot `periodo` de `EncabezadoDeVista`. Los
 * estados en 0 no se ofrecen (salvo el elegido): un chip que lleva a nada es
 * ruido. Por debajo de 76rem del encabezado los chips de estado pasan a un
 * selector («Activos (6)»): misma elección, un tercio del ancho.
 */

import { Search } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { CLASE_CAMPO, claseChipFiltro } from "../rrhh-form";
import type { EstadoColaborador, PuestoDTO } from "@/lib/rrhh/tipos";

export type ChipEstado = EstadoColaborador | "TODOS";

const CHIPS_ESTADO: { id: ChipEstado; label: string }[] = [
  { id: "TODOS", label: "Todos" },
  { id: "ACTIVO", label: "Activos" },
  { id: "VACACIONES", label: "Vacaciones" },
  { id: "LICENCIA", label: "Licencia" },
  { id: "SUSPENDIDO", label: "Suspendidos" },
  { id: "CESADO", label: "Retirados" },
];

interface Props {
  qInput: string;
  onQ: (v: string) => void;
  puestoId: string;
  onPuesto: (v: string) => void;
  puestos: readonly Pick<PuestoDTO, "id" | "nombre">[];
  chip: ChipEstado;
  onChip: (v: ChipEstado) => void;
  /** Cuántos hay por estado. */
  conteo: Record<EstadoColaborador, number>;
  total: number;
  cuantosPorVencer: number;
  soloPorVencer: boolean;
  onSoloPorVencer: () => void;
}

export default function FiltrosPersonal(p: Props) {
  const chips = CHIPS_ESTADO.filter((c) => c.id === "TODOS" || c.id === p.chip || p.conteo[c.id] > 0);
  const cuantos = (c: ChipEstado) => (c === "TODOS" ? p.total : p.conteo[c]);
  return (
    <>
      <div className="relative min-w-[9rem] flex-1">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
        <input value={p.qInput} onChange={(e) => p.onQ(e.target.value)} placeholder="Buscar por nombre..." aria-label="Buscar personal por nombre" className={cn(CLASE_CAMPO, "pl-10")} />
      </div>
      <select value={p.puestoId} onChange={(e) => p.onPuesto(e.target.value)} aria-label="Filtrar por puesto" className={cn(CLASE_CAMPO, "w-auto")}>
        <option value="">Todos los puestos</option>
        {p.puestos.map((x) => (
          <option key={x.id} value={x.id}>
            {x.nombre}
          </option>
        ))}
      </select>
      <select value={p.chip} onChange={(e) => p.onChip(e.target.value as ChipEstado)} aria-label="Filtrar por estado" className={cn(CLASE_CAMPO, "w-auto @min-[76rem]/enc:hidden")}>
        {chips.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label} ({cuantos(c.id)})
          </option>
        ))}
      </select>
      <div role="group" aria-label="Filtrar por estado" className="hidden flex-wrap gap-1.5 @min-[76rem]/enc:flex">
        {chips.map((c) => (
          <button key={c.id} type="button" aria-pressed={p.chip === c.id} onClick={() => p.onChip(c.id)} className={claseChipFiltro(p.chip === c.id)}>
            {c.label} <span className="tabular-nums opacity-80">{cuantos(c.id)}</span>
          </button>
        ))}
      </div>
      {(p.cuantosPorVencer > 0 || p.soloPorVencer) && (
        <button type="button" aria-pressed={p.soloPorVencer} onClick={p.onSoloPorVencer} className={claseChipFiltro(p.soloPorVencer)} title="Sólo quien tiene el contrato por vencer">
          Por vencer <span className="tabular-nums opacity-80">{p.cuantosPorVencer}</span>
        </button>
      )}
    </>
  );
}
