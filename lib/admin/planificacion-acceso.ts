/**
 * lib/admin/planificacion-acceso.ts — quién lee y quién escribe el plan de la
 * empresa (ADR-497). Única fuente para las tres rutas de `/api/admin/planificacion`.
 *
 * `requireAdmin` deja pasar SIEMPRE a admin/owner/manager (bypass de
 * management-tier), así que las secciones sensibles (socios e inversión: plata
 * y DNI) NO se pueden cerrar sólo con `allowedRoles`: un manager pasaría. Por
 * eso cada ruta pregunta además `puedeVerSeccion` / `puedeEditarSeccion`.
 *
 * Puro (sin server-only): lo pueden importar los tests y, si hiciera falta, el cliente.
 */
import type { AdminRole } from "@/lib/session";
import { SECCIONES_PLAN, SECCIONES_SENSIBLES, type SeccionPlan } from "@/lib/planificacion/secciones";

/**
 * Leen el plan (sin las sensibles, salvo los dueños). `tienda_owner` es el dueño
 * de su tienda: la barra le muestra Planificación (panel-sin-perdida, alta del
 * 16-10), así que sin él vería la pestaña y un 403.
 */
export const ROLES_LEER_PLAN = ["admin", "owner", "tienda_owner", "manager", "cajero", "almacenero", "analista"] as const satisfies readonly AdminRole[];
/** Escriben las secciones que ven. */
export const ROLES_ESCRIBIR_PLAN = ["admin", "owner", "tienda_owner", "manager"] as const satisfies readonly AdminRole[];
/** Leen y escriben socios e inversión. */
export const ROLES_SENSIBLES_PLAN = ["admin", "owner", "tienda_owner"] as const satisfies readonly AdminRole[];

const incluye = (roles: readonly AdminRole[], rol: AdminRole) => roles.includes(rol);

export function puedeVerSeccion(rol: AdminRole, seccion: SeccionPlan): boolean {
  if (!incluye(ROLES_LEER_PLAN, rol)) return false;
  return !SECCIONES_SENSIBLES.has(seccion) || incluye(ROLES_SENSIBLES_PLAN, rol);
}

export function puedeEditarPlan(rol: AdminRole): boolean {
  return incluye(ROLES_ESCRIBIR_PLAN, rol);
}

export function puedeEditarSeccion(rol: AdminRole, seccion: SeccionPlan): boolean {
  return puedeEditarPlan(rol) && puedeVerSeccion(rol, seccion);
}

/** Las secciones que este rol no ve: van en `ocultas` y fuera de `secciones`. */
export function seccionesOcultas(rol: AdminRole): SeccionPlan[] {
  return SECCIONES_PLAN.filter((s) => !puedeVerSeccion(rol, s));
}
