/**
 * loth-plan-permiso.ts — ¿este plan y algún permiso son el mismo papel?
 *
 * El plan de manejo (`ForestPlan`) y el permiso (`ForestContrato`) se atan por
 * `contratoId`, pero hoy sólo se atan si el permiso se elige desde el
 * Directorio al dar de alta el plan. En Blas hay un plan y un permiso con el
 * MISMO código (19-SEC/REG-PLT-2025-096) sin enlace: son el mismo papel, y la
 * pantalla podía decirlo.
 *
 * La regla es angosta a propósito: se sugiere sólo cuando hay UN candidato y
 * ese permiso no está atado a OTRO plan. Con dos o más, elegir es una decisión
 * de la persona (en el Directorio), no de una coincidencia de texto.
 */
import { normalizarCodigoContrato } from "@/lib/forestal/contratos";

/**
 * El código comparable: la forma canónica del permiso (mayúsculas, espacios
 * colapsados) y, además, sin espacios — «19-SEC/REG-PLT-2025-096» y
 * «19-SEC/ REG-PLT-2025-096» se escribieron del mismo papel.
 */
export function codigoComparable(codigo: string | null | undefined): string {
  return normalizarCodigoContrato(codigo ?? "").replace(/\s+/g, "");
}

export interface PlanParaUnir {
  id: string;
  contratoId?: string | null;
  planNumber?: string | null;
  tituloHabilitante?: string | null;
}

export interface PermisoParaUnir {
  id: string;
  codigo: string;
  codigoNorm?: string | null;
  planId?: string | null;
}

/**
 * El único permiso del tenant con el mismo código que el plan, o `null`.
 *
 * El plan lleva el código del papel en `planNumber` (así en Blas) o en
 * `tituloHabilitante`; se miran los dos. `null` cuando el plan ya tiene
 * permiso, cuando no hay coincidencia, cuando hay dos o más, o cuando el único
 * que coincide ya está atado a otro plan.
 */
export function permisoGemeloDelPlan<P extends PermisoParaUnir>(
  plan: PlanParaUnir | null | undefined,
  permisos: readonly P[],
): P | null {
  if (!plan?.id || plan.contratoId) return null;
  const codigos = new Set(
    [plan.planNumber, plan.tituloHabilitante].map(codigoComparable).filter((c) => c.length >= 3),
  );
  if (codigos.size === 0) return null;
  const candidatos = permisos.filter((p) => codigos.has(codigoComparable(p.codigoNorm || p.codigo)));
  if (candidatos.length !== 1) return null;
  const [unico] = candidatos;
  if (unico.planId && unico.planId !== plan.id) return null;
  return unico;
}
