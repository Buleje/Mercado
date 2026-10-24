/**
 * lib/admin/agenda-acceso.ts — quién lee, escribe y conecta la agenda de
 * Administración (ADR-501 §7). Única fuente para `/api/admin/agenda/**`.
 *
 * `requireAdmin` deja pasar SIEMPRE a admin/owner/manager (bypass de
 * management-tier): por eso `ROLES_CONECTAR_AGENDA` (sin manager) no se cierra
 * sólo con `allowedRoles`; la ruta pregunta además `puedeConectarAgenda`.
 *
 * Cajero, almacenero y analista ven y marcan SÓLO las actividades cuyo
 * `responsableRol` es su rol: el filtro vive en `AgendaDB` (servidor), no en la UI.
 *
 * Puro (sin server-only): lo importan las rutas, `roles-rutas-panel.ts` y el cliente.
 */
import type { AdminRole } from "@/lib/session";

/** Abren la pestaña y leen «Hoy» / calendario (igual que `ROLES_LEER_PLAN`). */
export const ROLES_LEER_AGENDA = [
  "admin",
  "owner",
  "tienda_owner",
  "manager",
  "cajero",
  "almacenero",
  "analista",
] as const satisfies readonly AdminRole[];
/** Crean, editan y borran actividades; ven TODAS. */
export const ROLES_ESCRIBIR_AGENDA = ["admin", "owner", "tienda_owner", "manager"] as const satisfies readonly AdminRole[];
/** Feeds ICS y Google: sacan datos del negocio fuera de Buleje. */
export const ROLES_CONECTAR_AGENDA = ["admin", "owner", "tienda_owner"] as const satisfies readonly AdminRole[];
/**
 * Dueño/admin: ven y revocan TODAS las conexiones de Google del negocio, no sólo
 * la suya (si al admin que conectó lo despiden, el dueño debe poder cortarle la
 * sync a su Google personal). El resto de los que conectan (tienda_owner) sólo
 * ve y revoca la propia.
 */
export const ROLES_ADMINISTRAR_CONEXIONES = ["admin", "owner"] as const satisfies readonly AdminRole[];

const incluye = (roles: readonly AdminRole[], rol: AdminRole | null | undefined): boolean =>
  !!rol && roles.includes(rol);

export function puedeLeerAgenda(rol: AdminRole | null | undefined): boolean {
  return incluye(ROLES_LEER_AGENDA, rol);
}

export function puedeEscribirAgenda(rol: AdminRole | null | undefined): boolean {
  return incluye(ROLES_ESCRIBIR_AGENDA, rol);
}

/** El manager pasa `requireAdmin` igual: la ruta de ICS/Google llama esto además. */
export function puedeConectarAgenda(rol: AdminRole | null | undefined): boolean {
  return incluye(ROLES_CONECTAR_AGENDA, rol);
}

/** ¿Puede ver y revocar las conexiones de Google de OTROS usuarios del negocio? */
export function puedeAdministrarConexiones(rol: AdminRole | null | undefined): boolean {
  return incluye(ROLES_ADMINISTRAR_CONEXIONES, rol);
}

/** Quien escribe ve todas; el resto, sólo las que tienen su rol de responsable. */
export function veTodasLasActividades(rol: AdminRole | null | undefined): boolean {
  return puedeEscribirAgenda(rol);
}

export function puedeVerActividad(
  rol: AdminRole | null | undefined,
  actividad: { responsableRol: string | null },
): boolean {
  if (!puedeLeerAgenda(rol)) return false;
  return veTodasLasActividades(rol) || actividad.responsableRol === rol;
}
