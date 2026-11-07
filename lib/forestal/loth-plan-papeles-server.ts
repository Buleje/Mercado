import "server-only";

/**
 * Papeles del permiso — el lado servidor (`loth-plan-papeles` es la regla pura).
 *
 * `papelesDelPlan(tenantId, planId)` es la puerta para quien necesite la
 * cuenta sin abrir la pestaña: el semáforo antimulta (`loth-plan-semaforo`,
 * entrada `papeles`) la toma con `resumenParaSemaforo(r)`. Sólo lee.
 */
import { ForestPlanDB } from "@/lib/db/forest-plan.db";
import { ForestPlanDocumentosDB } from "@/lib/db/forest-plan-documentos.db";
import { archivosDeVista, papelesDePlan, type PapelesDelPlan } from "@/lib/forestal/loth-plan-papeles";
import type { PlanDocumentosVista } from "@/lib/forestal/plan-documentos-tipos";
import { limaDateKey } from "@/lib/utils";

const isoDia = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

/**
 * Los papeles que la norma pide para ESTE plan y cuáles están en su carpeta.
 * `null` = el plan no es de este negocio (o está dado de baja).
 *
 * `viewerRole`: con el rol de quien mira, un archivo que no ve (candado del
 * documento o de su carpeta) cuenta como «está» pero sin nombre ni id
 * (security 25-10). Sin rol = todo: el semáforo sólo lee la cuenta.
 *
 * @example
 *   const r = await papelesDelPlan(auth.tenantId, planId);
 *   semaforoDelPlan({ ...datos, papeles: r ? resumenParaSemaforo(r) : null });
 */
export async function papelesDelPlan(
  tenantId: string,
  planId: string,
  hoy: string = limaDateKey(),
  viewerRole?: string,
): Promise<(PapelesDelPlan & { vista: PlanDocumentosVista }) | null> {
  if (!tenantId) throw new Error("tenantId is required");
  const [plan, vista] = await Promise.all([
    ForestPlanDB.getPlan(tenantId, planId),
    ForestPlanDocumentosDB.vista(tenantId, planId, viewerRole),
  ]);
  if (!plan || !vista) return null;
  const r = papelesDePlan(
    {
      planType: plan.planType,
      titularName: plan.titularName,
      propietarioNombre: plan.propietarioNombre,
      vigenciaHasta: isoDia(plan.vigenciaHasta),
    },
    archivosDeVista(vista),
    hoy,
  );
  return { ...r, vista };
}
