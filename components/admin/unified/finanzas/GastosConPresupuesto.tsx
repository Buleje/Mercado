"use client";

/**
 * Gastos con su presupuesto adentro.
 *
 * El presupuesto no es otra sección: es el TECHO de estos mismos gastos. Verlos
 * en dos pestañas distintas obligaba a ir y volver para contestar una sola
 * pregunta —«¿me pasé?»—, y encima la pestaña estaba vacía para quien nunca
 * cargó una categoría (cero en el tenant real, medido 2026-09-21).
 *
 * Por eso vive acá abajo, plegado, y se abre solo cuando hay presupuesto
 * cargado o cuando se entró por su propia dirección (`?vista=presupuesto`, que
 * sigue funcionando: ver `estructura.ts`).
 */

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronRight, Target } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const ExpensesTab = dynamic(() => import("@/components/admin/ExpensesTab"), { loading: S });
const BudgetVsRealTab = dynamic(() => import("@/components/admin/BudgetVsRealTab"), { loading: S });
const PresupuestoMensualTab = dynamic(() => import("@/components/admin/finanzas/PresupuestoMensualTab"), { loading: S });

interface Props {
  /** Se entró por `?vista=presupuesto`: abrir y llevar el ojo ahí. */
  pedidoPorUrl: boolean;
  /** Si hay categorías de presupuesto cargadas. `undefined` = todavía no se sabe. */
  hayPresupuesto: boolean | undefined;
}

export default function GastosConPresupuesto({ pedidoPorUrl, hayPresupuesto }: Props) {
  const [abierto, setAbierto] = useState(pedidoPorUrl);
  /** Si ya lo tocaste, manda tu mano: el dato que llega tarde no te lo reabre. */
  const tocado = useRef(false);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hayPresupuesto && !tocado.current) setAbierto(true);
  }, [hayPresupuesto]);

  useEffect(() => {
    if (!pedidoPorUrl) return;
    setAbierto(true);
    caja.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [pedidoPorUrl]);

  return (
    <div className="space-y-6">
      <ExpensesTab />

      <div ref={caja} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <button
          type="button"
          aria-expanded={abierto}
          aria-controls="panel-presupuesto"
          onClick={() => {
            tocado.current = true;
            setAbierto((v) => !v);
          }}
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
        >
          <ChevronRight
            className={cn("h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform", abierto && "rotate-90")}
            aria-hidden
          />
          <Target className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">Presupuesto del mes</CardTitle>
          <span className="truncate text-sm font-medium text-[var(--text-tertiary)]">
            {hayPresupuesto === false
              ? "· todavía no le pusiste techo a ningún rubro"
              : "· el techo de estos mismos gastos"}
          </span>
        </button>
        {abierto && (
          <div id="panel-presupuesto" className="space-y-6 border-t border-[var(--rule-base)] p-4">
            <BudgetVsRealTab />
            <PresupuestoMensualTab />
          </div>
        )}
      </div>
    </div>
  );
}
