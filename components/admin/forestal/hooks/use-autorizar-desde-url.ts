"use client";

/**
 * `?autorizar=<especie>` → la vista del plan abre «Cargar lo autorizado» con
 * esa especie elegida (lo escribe «Cupo por especie», `loth-autorizar-url`).
 *
 * El cupo del libro se mide contra el plan ACTIVO (`?active=1` en
 * `LothLibroOperaciones`), y el selector de esta vista arranca en el más nuevo:
 * con dos planes vivos (Blas, 30-09) no tienen por qué ser el mismo. Por eso
 * el pedido cambia al plan activo antes de abrir: lo autorizado se carga en el
 * plan cuyo cupo se estaba mirando, no en otro.
 */

import { useEffect, useState } from "react";
import { tomarPedidoAutorizar } from "../loth-autorizar-url";

interface PlanElegible {
  id: string;
  isActive?: boolean;
}

export function useAutorizarDesdeUrl({ plans, planId, setPlanId, onAbrir }: {
  plans: readonly PlanElegible[];
  planId: string | null;
  setPlanId: (id: string) => void;
  onAbrir: (especie: string) => void;
}): void {
  const [pendiente, setPendiente] = useState<string | null>(null);

  useEffect(() => {
    const leer = () => {
      const e = tomarPedidoAutorizar();
      if (e) setPendiente(e);
    };
    leer();
    window.addEventListener("popstate", leer);
    return () => window.removeEventListener("popstate", leer);
  }, []);

  useEffect(() => {
    if (!pendiente || plans.length === 0) return;
    const destino = plans.find((p) => p.isActive) ?? plans[0];
    if (destino.id !== planId) setPlanId(destino.id);
    onAbrir(pendiente);
    setPendiente(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sólo cuando hay pedido y planes
  }, [pendiente, plans]);
}
