"use client";

/**
 * Los lotes tildados de la vista Lotes (Brandon, 2026-10-02).
 *
 * La selección vive sobre lo que se VE: cambiar un filtro o recargar la limpia.
 * Sin eso, un lote tildado que el filtro escondió seguiría yendo a la guía sin
 * que nadie lo vea en pantalla — y una recarga trae lotes nuevos (otro estado,
 * otro saldo) contra los que la cuenta de la barra ya no vale.
 *
 * El reinicio se hace al pintar, comparando con lo anterior (el patrón de React
 * para «resetear estado cuando cambia una prop»), no en un efecto: así no hay
 * un cuadro con la barra vieja encima de los lotes nuevos.
 */

import { useCallback, useMemo, useState } from "react";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";

export function useSeleccionLotes(
  lotes: readonly LoteAserrio[],
  visibles: readonly LoteAserrio[],
  /** Cualquier cambio de filtro, escrito como texto: si cambia, se limpia. */
  claveFiltro: string,
) {
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(() => new Set());
  const [base, setBase] = useState({ lotes, claveFiltro });
  if (base.lotes !== lotes || base.claveFiltro !== claveFiltro) {
    setBase({ lotes, claveFiltro });
    if (elegidos.size > 0) setElegidos(new Set());
  }

  const alternar = useCallback((id: string) => {
    setElegidos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /** Los elegidos, en el orden de la pantalla. */
  const lista = useMemo(() => visibles.filter((l) => elegidos.has(l.id)), [visibles, elegidos]);
  const todos = visibles.length > 0 && lista.length === visibles.length;
  const algunos = lista.length > 0 && !todos;

  const alternarTodos = useCallback(() => {
    setElegidos(todos ? new Set() : new Set(visibles.map((l) => l.id)));
  }, [todos, visibles]);

  const limpiar = useCallback(() => setElegidos(new Set()), []);

  return { elegidos, alternar, lista, todos, algunos, alternarTodos, limpiar };
}

export type SeleccionLotes = ReturnType<typeof useSeleccionLotes>;
