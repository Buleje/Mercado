"use client";

/**
 * LothTraceGrupo — un tramo de la lista de talados: «En movimiento» o
 * «Terminados». Las tarjetas y la tabla son las de siempre (`LothTraceCard`,
 * `LothTraceTabla`); este bloque sólo les pone su subtítulo y su cuenta.
 *
 * La cuenta es la del grupo ENTERO con los filtros puestos, no la de la página:
 * «Terminados 4» aunque la página muestre dos.
 */

import { BlockTitle } from "@buleje/design-system";
import type { TraceFila } from "@/lib/forestal/loth-trace-tabla";
import type { GrupoArbol } from "@/lib/forestal/loth-trace-grupos";
import { formatNumber } from "@/lib/format";
import LothTraceCard from "./LothTraceCard";
import LothTraceTabla from "./LothTraceTabla";
import type { TraceModo, TraceOrden } from "./loth-trace-ui";
import type { FiltrosTabla } from "./filtros-tabla-forestal";

export const GRUPO_META: Record<Exclude<GrupoArbol, "en_pie">, { titulo: string; nota: string }> = {
  movimiento: { titulo: "En movimiento", nota: "talados con algo pendiente" },
  terminado: { titulo: "Terminados", nota: "todas sus trozas salieron" },
};

export default function LothTraceGrupo({
  grupo,
  total,
  items,
  modo,
  seleccion,
  onSeleccionar,
  onAbrir,
  orden,
  onOrden,
  filtros,
}: {
  grupo: Exclude<GrupoArbol, "en_pie">;
  /** Árboles del grupo con los filtros puestos (todas las páginas). */
  total: number;
  /** Los de ESTA página. */
  items: { f: TraceFila; m: { hint: string | null } }[];
  modo: TraceModo;
  seleccion: Set<string>;
  onSeleccionar: (tree: string) => void;
  onAbrir: (tree: string) => void;
  orden: TraceOrden;
  onOrden: (o: TraceOrden) => void;
  /** El autofiltro de cada columna (va en la cabecera de la tabla). */
  filtros?: FiltrosTabla<TraceFila>;
}) {
  if (items.length === 0) return null;
  const meta = GRUPO_META[grupo];
  return (
    <div className="space-y-2" data-grupo={grupo}>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <BlockTitle as="h4">{meta.titulo}</BlockTitle>
        <span className="text-sm tabular-nums text-[var(--text-tertiary)]">
          {formatNumber(total)} · {meta.nota}
        </span>
      </div>
      {modo === "tabla" ? (
        <LothTraceTabla
          filas={items.map(({ f }) => f)}
          seleccion={seleccion}
          onSeleccionar={onSeleccionar}
          onAbrir={onAbrir}
          orden={orden}
          onOrden={onOrden}
          filtros={filtros}
        />
      ) : (
        <div className="space-y-2.5">
          {items.map(({ f, m }) => (
            <LothTraceCard
              key={f.tree}
              fila={f}
              matchHint={m.hint}
              seleccionada={seleccion.has(f.tree)}
              onSeleccionar={onSeleccionar}
              onAbrir={onAbrir}
            />
          ))}
        </div>
      )}
    </div>
  );
}
