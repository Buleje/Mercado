"use client";

import { nombreDePlan, type PlanOpcion } from "./loth-rentabilidad-datos";

/** El plan del que se leen las cifras. Sólo se ofrece con 2 o más planes. */
export default function SelectorPlan({
  planes,
  planId,
  onElegir,
}: {
  planes: PlanOpcion[];
  planId: string | undefined;
  onElegir: (id: string) => void;
}) {
  if (planes.length < 2 || !planId) return null;
  return (
    <>
      <label className="sr-only" htmlFor="rentabilidad-plan">Plan</label>
      <select
        id="rentabilidad-plan"
        value={planId}
        onChange={(e) => onElegir(e.target.value)}
        className="h-10 max-w-[16rem] rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] focus:outline-none"
      >
        {planes.map((p) => <option key={p.id} value={p.id}>{nombreDePlan(p)}</option>)}
      </select>
    </>
  );
}
