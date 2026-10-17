"use client";

/**
 * Demanda del Análisis (N06): a qué hora y qué día entran los pedidos (hora de
 * Lima) y por dónde entran. Barras simples: el largo es la parte del total.
 */

import { CardTitle } from "@buleje/design-system";
import type { Grupo } from "@/lib/pedidos/analisis-operativo";
import { NumerosDePedido } from "@/components/admin/pedidos/preparacion/piezas";

function Barras({ titulo, grupos }: { titulo: string; grupos: readonly Grupo[] }) {
  const max = Math.max(1, ...grupos.map((g) => g.pedidos));
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <CardTitle>{titulo}</CardTitle>
      {grupos.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">Sin pedidos en este período.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {grupos.map((g) => (
            <li key={g.clave} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-[var(--text-primary)]">{g.rotulo}</span>
                <span className="font-bold tabular-nums text-[var(--text-primary)]">{g.pedidos}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden>
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.round((g.pedidos / max) * 100)}%` }} />
              </div>
              <NumerosDePedido ids={g.ids.map((id) => ({ id }))} total={g.pedidos} max={3} etiqueta={`Pedidos de ${g.rotulo}`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function SeccionDemanda({ franjas, dias, origenes }: { franjas: readonly Grupo[]; dias: readonly Grupo[]; origenes: readonly Grupo[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-3">
      <Barras titulo="A qué hora entran" grupos={franjas} />
      <Barras titulo="Qué día entran" grupos={dias} />
      <Barras titulo="Por dónde entran" grupos={origenes} />
    </div>
  );
}
