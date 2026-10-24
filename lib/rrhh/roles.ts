/**
 * roles.ts — quién ve qué en Recursos Humanos (ADR-414 §7).
 *
 * Tres niveles, cada uno estrictamente más chico que el anterior. El hub NO
 * deduce el nivel en el cliente: `GET /api/rrhh/resumen` lo manda y cada ruta
 * lo vuelve a decidir del lado del servidor con `nivelDeRol` — un cliente
 * manipulado no puede pedirse a sí mismo más de lo que le toca.
 *
 * `lib/auth/role-permissions.ts` NO se toca (ADR-414 §7): cada ruta de RRHH
 * lleva su lista explícita de roles en `requireAdmin`, como `app/api/contratos/**`.
 *
 * PURO: sin Prisma, React ni fetch.
 */

import type { AdminRole } from "@/lib/session";
import type { FechaKey, NivelRrhh } from "./tipos";
import { sumarDias } from "./fechas";

/** admin, owner: todo — documento, celular, contacto de emergencia, tarifas, lo ganado, vincular cuenta, exportar, eliminar. */
export const RRHH_COMPLETO: readonly AdminRole[] = ["admin", "owner"];

/** + manager: personal, puestos, contratos y asistencia; documento enmascarado; sin tarifas ni ganado. */
export const RRHH_GESTION: readonly AdminRole[] = [...RRHH_COMPLETO, "manager"];

/** + almacenero, cajero: nombre, apodo, puesto y estado; marcar dentro de la ventana de 3 días. */
export const RRHH_MARCAR: readonly AdminRole[] = [...RRHH_GESTION, "almacenero", "cajero"];

/**
 * Días hacia atrás que puede corregir el nivel `marcar` (hoy − 2 … hoy, tres
 * días en total): alcanza para corregir el olvido del día sin abrir todo el
 * historial (ADR-414 §4).
 */
const DIAS_VENTANA_MARCAR = 2;

/** El nivel de RRHH de este rol, o `null` si el rol no entra al hub. */
export function nivelDeRol(role: AdminRole): NivelRrhh | null {
  if (RRHH_COMPLETO.includes(role)) return "completo";
  if (RRHH_GESTION.includes(role)) return "gestion";
  if (RRHH_MARCAR.includes(role)) return "marcar";
  return null;
}

/**
 * Hasta qué día atrás puede corregir asistencia este rol.
 *
 * `completo` y `gestion` (admin, owner, manager): cualquier día pasado, sin
 * tope (`desde: null`). `marcar` (almacenero, cajero): `hoy − 2 … hoy` — la
 * marca cambia lo ganado, y tres días de margen alcanzan para corregir un
 * olvido sin dejar la ventana abierta indefinidamente.
 */
export function ventanaDeMarcado(
  nivel: NivelRrhh,
  _role: AdminRole,
  hoy: FechaKey,
): { desde: FechaKey | null; hasta: FechaKey } {
  if (nivel !== "marcar") return { desde: null, hasta: hoy };
  return { desde: sumarDias(hoy, -DIAS_VENTANA_MARCAR), hasta: hoy };
}
