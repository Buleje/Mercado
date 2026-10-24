"use client";

/**
 * «Para atender ahora» del centro de notificaciones: el estado de hoy y los
 * avisos sin leer, agrupados por lo que hay que HACER (M08, 17-10: «Cuadrar
 * la caja», «Cobrar 3», «Reponer 5», en orden de impacto) y, debajo, lo que no
 * es de ningún grupo (recordatorios).
 *
 * Rediseño 18-10: un solo bloque hundido ARRIBA de la lista (antes era una
 * columna a la derecha desde 1280 px: lo urgente quedaba al costado), en dos
 * columnas desde `lg`. Se ven las primeras 4; «Ver las N» abre el resto.
 */
import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { FilaAccion } from "./AccionesAgrupadas";
import AlertaAhoraFila from "./AlertaAhoraFila";
import type { AlertaAhora } from "./use-alertas-consolidadas";
import type { GrupoConEnlace } from "./use-acciones-de-avisos";

interface Props {
  grupos: readonly GrupoConEnlace[];
  sueltas: readonly AlertaAhora[];
  onNavegar: () => void;
}

/** Cuántas se ven sin abrir: dos filas del bloque en escritorio. */
const A_LA_VISTA = 4;

export default function SeccionAhora({ grupos, sueltas, onNavegar }: Props) {
  const [todas, setTodas] = useState(false);
  const total = grupos.length + sueltas.length;
  if (total === 0) return null;
  const filas = [
    ...grupos.map((g) => <FilaAccion key={`g-${g.id}`} grupo={g} onNavegar={onNavegar} />),
    ...sueltas.map((a) => <AlertaAhoraFila key={`a-${a.id}`} alerta={a} onNavegar={onNavegar} />),
  ];
  const visibles = todas ? filas : filas.slice(0, A_LA_VISTA);
  return (
    <section aria-labelledby="notif-ahora" className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-baseline gap-1.5">
          <CardTitle id="notif-ahora" className="text-sm font-semibold text-[var(--text-primary)]">
            Para atender ahora
          </CardTitle>
          <span className="text-sm tabular-nums text-[var(--text-tertiary)]">{total}</span>
        </div>
        {total > A_LA_VISTA && (
          <button
            type="button"
            onClick={() => setTodas((v) => !v)}
            aria-expanded={todas}
            className="-my-2 -mr-2 inline-flex h-12 items-center rounded-xl px-3 text-sm font-semibold text-[var(--accent-ink)] hover:bg-[var(--accent)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] dark:text-[var(--accent)]"
          >
            {todas ? "Ver menos" : `Ver las ${total}`}
          </button>
        )}
      </div>
      <div className="grid gap-0.5 rounded-2xl bg-[var(--surface-sunken)] p-1 lg:grid-cols-2">{visibles}</div>
    </section>
  );
}
