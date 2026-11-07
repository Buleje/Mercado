"use client";

/**
 * La pestaña «Papeles» del plan abierto, en dos tarjetas: lo que la norma pide
 * para el permiso (`PapelesDelPlan`), arriba, agrupado por lo que pide hacer;
 * y las carpetas del plan en el Archivo (`CarpetasDelPlan`), abajo, plegables.
 * Un papel lleva a su carpeta («Ir a su carpeta»): abre la tarjeta de abajo,
 * elige la carpeta y baja hasta su casillero.
 */

import { useState } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { VistaPlan } from "../hooks/use-loth-plan-view";
import { idCasillero } from "../plan-documentos/CarpetaPanel";
import CarpetasDelPlan, { ID_CARPETAS_DEL_PLAN } from "./CarpetasDelPlan";
import PapelesDelPlan from "./PapelesDelPlan";

/** Recordado para todos los planes, como «Si aplica». */
const CLAVE_CARPETAS_ABIERTAS = "loth:plan:papeles-carpetas-abiertas";

export default function PestanaPapeles({
  v,
  plan,
}: {
  v: VistaPlan;
  plan: NonNullable<VistaPlan["plan"]>;
}) {
  const { d, docs, esPlantacion } = v;
  const [abierta, setAbierta] = useLocalStorage(CLAVE_CARPETAS_ABIERTAS, true);
  const [elegida, setElegida] = useState<string | null>(null);

  const irACarpeta = (carpetaClave: string, casilleroClave: string | null) => {
    setAbierta(true);
    setElegida(carpetaClave);
    /* Dos cuadros: la tarjeta se despliega y la carpeta elegida se pinta. */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el =
          (casilleroClave && document.getElementById(idCasillero(carpetaClave, casilleroClave))) ||
          document.getElementById(ID_CARPETAS_DEL_PLAN);
        el?.scrollIntoView({ block: "center", behavior: "smooth" });
        el?.focus({ preventScroll: true });
      }),
    );
  };

  return (
    <>
      <PapelesDelPlan
        planId={plan.id}
        esPlantacion={esPlantacion}
        vigenciaHasta={plan.vigenciaHasta}
        papeles={v.papeles}
        docs={docs}
        onPlanCambiado={async () => {
          await Promise.all([d.loadPlans(), d.loadDetail(plan.id)]);
        }}
        onIrACarpeta={irACarpeta}
      />
      <CarpetasDelPlan planId={plan.id} docs={docs} abierta={abierta} onAbierta={setAbierta} elegida={elegida} onElegir={setElegida} />
    </>
  );
}
