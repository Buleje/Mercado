"use client";

/**
 * LothTraceGrupo — un tramo de la lista de talados en TARJETAS: «En movimiento»
 * o «Terminados». Las tarjetas son las de siempre (`LothTraceCard`); este
 * bloque sólo les pone su subtítulo y su cuenta. En modo tabla los dos tramos
 * son filas de grupo de UNA tabla (`LothTraceTabla`, 08-10), con un solo pie.
 *
 * La cuenta es la del grupo ENTERO con los filtros puestos, no la de la página:
 * «Terminados 4» aunque la página muestre dos.
 */

import { BlockTitle } from "@buleje/design-system";
import type { TraceFila } from "@/lib/forestal/loth-trace-tabla";
import type { GrupoArbol } from "@/lib/forestal/loth-trace-grupos";
import { formatNumber } from "@/lib/format";
import LothTraceCard from "./LothTraceCard";

export const GRUPO_META: Record<Exclude<GrupoArbol, "en_pie">, { titulo: string; nota: string }> = {
  movimiento: { titulo: "En movimiento", nota: "talados con algo pendiente" },
  terminado: { titulo: "Terminados", nota: "todas sus trozas salieron" },
};

export default function LothTraceGrupo({
  grupo,
  total,
  items,
  seleccion,
  onSeleccionar,
  onAbrir,
}: {
  grupo: Exclude<GrupoArbol, "en_pie">;
  /** Árboles del grupo con los filtros puestos (todas las páginas). */
  total: number;
  /** Los de ESTA página. */
  items: { f: TraceFila; m: { hint: string | null } }[];
  seleccion: Set<string>;
  onSeleccionar: (tree: string) => void;
  onAbrir: (tree: string) => void;
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
    </div>
  );
}
