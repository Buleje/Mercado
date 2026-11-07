"use client";

/**
 * useLothImportPlan — los permisos entre los que se elige al importar líneas, y
 * el registro/saldo del elegido (ADR-459).
 *
 * Lee del servidor lo mismo que lee el libro: la lista de planes vivos, las
 * especies del plan (`?planId=`) y su balance (`?balance=`, que ya suma lo
 * talado del plan + las líneas sin plan). Nada se calcula acá.
 */

import { useEffect, useMemo, useState } from "react";
import { esPlanDePlantacion } from "@/lib/forestal/loth-poa";
import {
  planPorDefecto,
  rotuloPlanImport,
  type EspecieDelPlanImport,
  type PlanImportOpcion,
  type PlanParaImportar,
} from "@/lib/forestal/loth-import-plan";
import { claveEspecie } from "@/lib/forestal/loth-constants";

interface EspecieApi {
  speciesCommon: string;
  speciesScientific?: string | null;
  volumenAutorizadoM3: string | number;
}
interface FilaBalanceApi {
  species: string;
  talado: number;
}

export function useLothImportPlan(open: boolean) {
  const [planes, setPlanes] = useState<PlanImportOpcion[]>([]);
  const [cargandoPlanes, setCargandoPlanes] = useState(false);
  const [errorPlanes, setErrorPlanes] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<{ planId: string; especies: EspecieDelPlanImport[] | null } | null>(null);

  // Al abrir: la lista de planes vivos y el que se propone.
  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setCargandoPlanes(true);
    setErrorPlanes(null);
    fetch("/api/admin/forestal/plan", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<{ plans?: PlanImportOpcion[] }>;
      })
      .then((j) => {
        if (cancel) return;
        const lista = j.plans ?? [];
        setPlanes(lista);
        setPlanId(planPorDefecto(lista));
      })
      .catch((err) => {
        if (cancel) return;
        console.warn("[useLothImportPlan] planes failed", err);
        setErrorPlanes("No se pudo leer la lista de permisos. Cierra y vuelve a abrir la importación.");
      })
      .finally(() => {
        if (!cancel) setCargandoPlanes(false);
      });
    return () => {
      cancel = true;
    };
  }, [open]);

  // Del elegido: el registro (especies) y lo ya talado. `null` en `especies` = no se pudo leer.
  useEffect(() => {
    if (!open || !planId) return;
    let cancel = false;
    const leer = async (url: string) => {
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    };
    Promise.all([
      leer(`/api/admin/forestal/plan?planId=${encodeURIComponent(planId)}`),
      leer(`/api/admin/forestal/plan?balance=${encodeURIComponent(planId)}`),
    ])
      .then(([det, bal]: [{ species?: EspecieApi[] }, { balance?: { rows?: FilaBalanceApi[] } }]) => {
        if (cancel) return;
        const talado = new Map((bal.balance?.rows ?? []).map((r) => [claveEspecie(r.species), Number(r.talado) || 0]));
        setDetalle({
          planId,
          especies: (det.species ?? [])
            .filter((s) => (s.speciesCommon ?? "").trim())
            .map((s) => ({
              speciesCommon: s.speciesCommon,
              speciesScientific: s.speciesScientific ?? null,
              volumenAutorizadoM3: Number(s.volumenAutorizadoM3) || 0,
              taladoM3: talado.get(claveEspecie(s.speciesCommon)) ?? 0,
            })),
        });
      })
      .catch((err) => {
        if (cancel) return;
        console.warn("[useLothImportPlan] detalle failed", err);
        setDetalle({ planId, especies: null });
      });
    return () => {
      cancel = true;
    };
  }, [open, planId]);

  const elegido = useMemo(() => planes.find((p) => p.id === planId) ?? null, [planes, planId]);
  const detalleListo = detalle != null && detalle.planId === planId;
  const plan = useMemo<PlanParaImportar | null>(() => {
    if (!elegido || !detalleListo || !detalle?.especies) return null;
    return { id: elegido.id, esPlantacion: esPlanDePlantacion(elegido), rotulo: rotuloPlanImport(elegido), especies: detalle.especies };
  }, [elegido, detalleListo, detalle]);

  return {
    planes,
    planId,
    setPlanId,
    /** Hay permisos entre los que elegir: entonces elegir es obligatorio. */
    hayPlanes: planes.length > 0,
    rotuloDe: rotuloPlanImport,
    plan,
    cargandoPlanes,
    /** Eligió un plan y todavía no llegó su registro. */
    cargandoDetalle: planId != null && !detalleListo,
    /** El registro del plan no se pudo leer: se puede importar, pero sin vista previa del saldo. */
    detalleFallo: detalleListo && detalle?.especies === null,
    errorPlanes,
  };
}
