"use client";

/**
 * El bloque «Documentos» del formulario del plan (crear o editar).
 *
 * · Al CREAR, todo queda pendiente en el formulario (`pendientes`) y se escribe
 *   al guardar: el plan todavía no tiene id ni carpeta en el Drive.
 * · Al EDITAR, va al servidor en el momento, igual que la pestaña «Documentos»
 *   de la vista del plan.
 *
 * `onOcupado` le avisa al formulario que algo está subiendo: cerrar el modal
 * en ese momento cortaría la subida a la mitad.
 */

import { useEffect } from "react";
import { usePlanDocumentos } from "../hooks/use-plan-documentos";
import PlanDocumentosAlta from "./PlanDocumentosAlta";
import PlanDocumentosDelPlan from "./PlanDocumentosDelPlan";
import type { DatosDelPlan } from "./acciones";
import type { PendientesDocumentos } from "./pendientes";

export default function PlanDocumentosEnFormulario({
  planId,
  pendientes,
  onPendientes,
  delPlan,
  onOcupado,
}: {
  /** null = alta. */
  planId: string | null;
  pendientes: PendientesDocumentos;
  onPendientes: (fn: (p: PendientesDocumentos) => PendientesDocumentos) => void;
  delPlan: DatosDelPlan;
  onOcupado?: (ocupado: boolean) => void;
}) {
  const docs = usePlanDocumentos({ planId, activo: planId != null });
  useEffect(() => {
    onOcupado?.(docs.ocupado);
  }, [docs.ocupado, onOcupado]);

  if (!planId) return <PlanDocumentosAlta pendientes={pendientes} onPendientes={onPendientes} delPlan={delPlan} />;
  return <PlanDocumentosDelPlan planId={planId} docs={docs} delPlan={delPlan} />;
}
