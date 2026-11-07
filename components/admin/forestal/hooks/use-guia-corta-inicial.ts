"use client";

/**
 * Con qué arranca «Anotar una guía» del Libro TH (`LothGtfForm`):
 *
 *   1. Titular y título del plan ELEGIDO en el libro (o del plan activo si se
 *      ve «Todos»), y su parcela de corta.
 *   2. Lo que siga vacío —titular, origen y destino— de la ÚLTIMA guía del
 *      MISMO permiso (Brandon 09-10, FOR-2: en Blas cada uno ya quedó escrito
 *      de dos maneras). Se dice de qué guía salió; todo queda editable.
 *
 * El paso 1 salió de `LothGtfForm` sin cambiar lo que pide ni cómo.
 */

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { copiarDeGuiaAnterior, ultimaGuiaDelPermiso, type GuiaCortaPrevia, type ParteCopiable } from "@/lib/forestal/loth-guia-anterior";

interface PlanParaGuia {
  id: string;
  titularName?: string | null;
  tituloHabilitante?: string | null;
  parcelaCorta?: string | null;
}

type Inicial = ParteCopiable & { tituloHabilitante: string; parcelaCorta: string };

export interface GuiaCopiada {
  gtfNumber: string;
  copiados: string[];
}

/** Lo del plan que cae en un casillero todavía vacío (el plan activo que llega tarde). */
function soloLoVacio(delPlan: Partial<Inicial>, actual: Inicial): Partial<Inicial> {
  const out: Partial<Inicial> = {};
  for (const k of Object.keys(delPlan) as (keyof Inicial)[]) {
    if (!(actual[k] ?? "").trim()) out[k] = delPlan[k];
  }
  return out;
}

export function useGuiaCortaInicial<F extends Inicial>(
  planElegido: PlanParaGuia | null,
  guias: readonly GuiaCortaPrevia[],
  f: F,
  setF: Dispatch<SetStateAction<F>>,
): GuiaCopiada | null {
  const [copiada, setCopiada] = useState<GuiaCopiada | null>(null);
  const fRef = useRef(f);
  const guiasRef = useRef(guias);
  const copiadaRef = useRef(copiada);
  /** El plan con el que arrancó el formulario (para la copia tardía de abajo). */
  const planRef = useRef<PlanParaGuia | null>(null);
  useEffect(() => {
    fRef.current = f;
    guiasRef.current = guias;
    copiadaRef.current = copiada;
  });

  /* El plan ELEGIDO pisa titular y título (como siempre: cambiar de plan
     cambia la identidad). El plan activo llega por fetch y puede llegar tarde:
     ése sólo llena lo vacío, para no pisar lo que ya se escribió. La guía
     anterior llena lo vacío DESPUÉS del plan, en el mismo paso: si no, el
     titular del plan llegaba tarde y la línea decía «titular» copiado sin serlo. */
  const arrancar = useCallback(
    (plan: PlanParaGuia, pisar: boolean) => {
      const delPlan: Partial<Inicial> = { titularName: plan.titularName ?? "", tituloHabilitante: plan.tituloHabilitante ?? "" };
      if (plan.parcelaCorta) delPlan.parcelaCorta = plan.parcelaCorta;
      const conPlan = (s: F): F => ({ ...s, ...(pisar ? delPlan : soloLoVacio(delPlan, s)) });
      planRef.current = plan;
      const previa = ultimaGuiaDelPermiso(guiasRef.current, plan.id);
      const antes = conPlan(fRef.current);
      const copia = previa ? copiarDeGuiaAnterior(antes, previa) : null;
      setF((s) => {
        const x = conPlan(s);
        return previa ? { ...x, ...copiarDeGuiaAnterior(x, previa).cambios } : x;
      });
      /* El titular que puso el plan no se cuenta como copiado aunque coincida. */
      const copiados = (copia?.copiados ?? []).filter((c) => !(c === "titular" && antes.titularName.trim()));
      setCopiada(previa && copiados.length ? { gtfNumber: previa.gtfNumber, copiados } : null);
    },
    [setF],
  );

  useEffect(() => {
    if (planElegido) {
      arrancar(planElegido, true);
      /* La parcela de corta no viaja en la lista del libro: se lee del plan elegido, como con el plan activo. */
      const ac = new AbortController();
      fetch(`/api/admin/forestal/plan?planId=${encodeURIComponent(planElegido.id)}`, { credentials: "include", signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { const pc = j?.plan?.parcelaCorta; if (typeof pc === "string" && pc) setF((s) => ({ ...s, parcelaCorta: pc })); })
        .catch((err) => { if (!ac.signal.aborted) console.warn("[loth-gtf] no se pudo precargar la parcela del plan elegido", err); });
      return () => ac.abort();
    }
    fetch("/api/admin/forestal/plan?active=1", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { const p = j?.active; if (p && typeof p.id === "string") arrancar(p as PlanParaGuia, false); })
      // Prefill best-effort: si no hay plan activo, el usuario completa a mano.
      .catch((err) => console.warn("[loth-gtf] no se pudo precargar el plan activo", err));
  }, [planElegido, arrancar, setF]);

  /* La lista de guías puede llegar DESPUÉS del plan (formulario abierto antes
     de que cargue; medido 09-10: sin esto, ni origen ni destino ni la línea).
     Entonces se copia, sólo en lo vacío, si todavía no se copió nada. */
  useEffect(() => {
    const plan = planRef.current;
    if (!plan || copiadaRef.current) return;
    const previa = ultimaGuiaDelPermiso(guias, plan.id);
    if (!previa) return;
    const copiados = copiarDeGuiaAnterior(fRef.current, previa).copiados.filter((c) => !(c === "titular" && fRef.current.titularName.trim()));
    setF((s) => ({ ...s, ...copiarDeGuiaAnterior(s, previa).cambios }));
    if (copiados.length) setCopiada({ gtfNumber: previa.gtfNumber, copiados });
  }, [guias, setF]);

  return copiada;
}
