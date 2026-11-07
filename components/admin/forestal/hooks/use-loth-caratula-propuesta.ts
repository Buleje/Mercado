"use client";

/**
 * Lo que el sistema ya sabe para prellenar la carátula (negocio + plan activo).
 * Best-effort: sin red o sin permiso la carátula igual se llena a mano.
 */

import { useEffect, useState } from "react";
import type { NegocioPropuesto, PlanPropuesto } from "@/lib/forestal/loth-caratula-pasos";

export interface PropuestaCaratula {
  negocio: NegocioPropuesto | null;
  plan: PlanPropuesto | null;
}

export function useLothCaratulaPropuesta(): { propuesta: PropuestaCaratula | null; cargando: boolean } {
  const [propuesta, setPropuesta] = useState<PropuestaCaratula | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const r = await fetch("/api/admin/forestal/loth/caratula/propuesta", { credentials: "include" });
        if (!r.ok || cancel) return;
        const j = await r.json();
        if (!cancel) setPropuesta({ negocio: j.negocio ?? null, plan: j.plan ?? null });
      } catch {
        /* la propuesta es un atajo: sin ella se tipea como siempre */
      } finally {
        if (!cancel) setCargando(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  return { propuesta, cargando };
}
