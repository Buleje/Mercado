/**
 * Unir un plan de manejo con su permiso — UNA implementación para las dos
 * pantallas que lo ofrecen: «Unirlos» en Plan de Manejo (`LothPlanAvisos`,
 * commit 80a3bf25f) y el aviso «plan sin permiso» de Extracción (ADR-455).
 *
 * Son las MISMAS dos escrituras que el alta de plan con Directorio: el plan
 * guarda su permiso (`PATCH /api/admin/forestal/plan` → `contratoId`) y el
 * permiso guarda su plan (`PATCH /api/admin/forestal/contratos/[id]` →
 * `planId`). Las dos rutas verifican que el otro sea del mismo negocio
 * (`exigirContratoDelTenant` / `exigirPlanDelTenant`). Si la segunda falla, el
 * plan YA quedó unido: se dice (`pendiente`), no se deshace.
 *
 * Después de unir se avisa por evento de ventana: la Extracción montada vuelve
 * a leer y el aviso se va solo.
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import type { AdminRole } from "@/lib/session";

/**
 * Quién puede unir: los roles de las dos rutas (`requireAdmin(req, ["admin",
 * "owner"])`, y el encargado pasa por el tier de gestión de `requireAdmin`).
 * Es para no mostrar un botón que terminaría en 403; el guard es el servidor.
 */
const PUEDEN_UNIR: readonly AdminRole[] = ["admin", "owner", "manager"];

export function puedeUnirPlanPermiso(rol: AdminRole | null | undefined): boolean {
  return rol != null && PUEDEN_UNIR.includes(rol);
}

export const EVENTO_PLAN_PERMISO = "loth-plan-permiso-cambio";

/** Lo llama quien acaba de unir un plan con su permiso. */
export function avisarPlanPermisoCambio(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENTO_PLAN_PERMISO));
}

/** Suscribe `alCambiar`; devuelve la baja, lista para el `return` de un `useEffect`. */
export function alCambiarPlanPermiso(alCambiar: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENTO_PLAN_PERMISO, alCambiar);
  return () => window.removeEventListener(EVENTO_PLAN_PERMISO, alCambiar);
}

/** La segunda escritura: la de `usePermisosForestal().actualizar` (que además refresca su lista). */
export type AtarPermiso = (contratoId: string, cambios: { planId: string }) => Promise<{ error: string | null }>;

/**
 * Une el plan con el permiso. Lanza si el plan no guardó su permiso (no quedó
 * nada unido); devuelve `pendiente` con el motivo si sólo falló el permiso.
 */
export async function unirPlanConPermiso(
  planId: string,
  contratoId: string,
  atarPermiso: AtarPermiso,
): Promise<{ pendiente: string | null }> {
  const r = await fetch("/api/admin/forestal/plan", {
    method: "PATCH",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ id: planId, contratoId }),
  });
  if (!r.ok) {
    const j = await leerJson<{ message?: string; error?: string }>(r);
    throw new Error(j?.message ?? j?.error ?? `No se pudo unir (HTTP ${r.status})`);
  }
  /* Del otro lado, el permiso guarda su plan. Si esto falla, el plan YA quedó
     unido: se dice, no se deshace. */
  const atado = await atarPermiso(contratoId, { planId });
  avisarPlanPermisoCambio();
  return { pendiente: atado.error };
}
