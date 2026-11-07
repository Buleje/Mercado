"use client";

/**
 * ¿Quien mira puede editar Adelantos? Lo decide la matriz (`adelantos:write`:
 * admin, dueño y encargado; el analista sólo lee) — el servidor lo vuelve a
 * mirar en cada ruta (`permisoAdelantos`).
 *
 * `null` mientras el rol carga (o si `/api/auth/me` no contestó): quien lo usa
 * para no pedir algo que daría 403 —la foto del DNI, ADR-525— tampoco lo pide
 * en ese rato.
 */

import { useMiRol } from "@/hooks/use-mi-rol";
import { checkPermission } from "@/lib/auth/role-permissions";

export function usePuedeEditarAdelantos(): boolean | null {
  const rol = useMiRol();
  return rol == null ? null : checkPermission(rol, "adelantos", "write");
}
