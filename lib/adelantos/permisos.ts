import "server-only";
import { NextResponse } from "next/server";
import { checkPermission, type Action, type Role } from "@/lib/auth/role-permissions";

/**
 * Quién puede qué en Adelantos: la matriz de `lib/auth/role-permissions.ts`
 * (recurso `adelantos`), aplicada en cada ruta (ADR-448, revisión de seguridad).
 *
 * El hueco que tapa: las rutas de `/api/adelantos` llamaban `requireAdmin(req)`
 * SIN roles, así que cualquier sesión del panel entraba — un cajero o un
 * almacenero, que en la matriz NO tienen `adelantos`, podían crear personas, dar
 * adelantos con caja pasando el tope (`forzarLimite`) y borrar una deuda con una
 * entrega libre sin caja. Y `requireAdmin(req, roles)` tampoco sirve para esto:
 * deja pasar a `manager` siempre (bypass de gestión), aunque la matriz no le dé
 * `delete`.
 *
 * Al 28-09 la matriz dice: admin y owner leen, escriben y borran; manager lee y
 * escribe; analista sólo lee; cajero, almacenero y el resto, nada. Este archivo
 * no copia esa lista: la LEE, así que cambiar la matriz cambia las rutas.
 *
 * `delete` en Adelantos = anular un adelanto (PATCH `cancelar` o DELETE), borrar
 * una persona o un recurrente: lo que hace desaparecer una deuda.
 */

const QUE: Record<Action, string> = {
  read: "ver los adelantos",
  write: "registrar o cambiar adelantos",
  delete: "anular adelantos ni borrar personas",
};

/** `null` = puede seguir; si no, el 403 que la ruta devuelve tal cual. */
export function permisoAdelantos(role: string, accion: Action): NextResponse | null {
  if (checkPermission(role as Role, "adelantos", accion)) return null;
  /* `error` legible: los modales de Adelantos muestran `error` tal cual. */
  const mensaje = `Tu rol no puede ${QUE[accion]}.`;
  return NextResponse.json({ error: mensaje, message: mensaje, code: "sin_permiso_adelantos" }, { status: 403 });
}

/**
 * ADR-491: entregar un adelanto (pantalla Entregar, Caja › Caja de hoy). Lee el
 * recurso `adelantos-entregar`, que tienen admin, dueño, encargado y el CAJERO;
 * el cajero NO tiene `adelantos`, así que sigue con 403 en editar, entregas,
 * anular, personas, cuentas y liquidar. Lo usan sólo `/api/adelantos/entregar/**`
 * y `POST …/firmas` con `entregaKey` (la firma del adelanto que acaba de dar).
 */
export function permisoEntregar(role: string): NextResponse | null {
  if (checkPermission(role as Role, "adelantos-entregar", "write")) return null;
  const mensaje = "Tu rol no puede entregar adelantos.";
  return NextResponse.json({ error: mensaje, message: mensaje, code: "sin_permiso_adelantos" }, { status: 403 });
}

/**
 * Quien entrega sin gestionar adelantos (el cajero): sólo CREA, plata dada, en
 * cuenta corriente, con fecha de hoy, hasta el tope de Ajustes, de la caja
 * abierta y con la firma de la persona. Lo decide la matriz, no el nombre del rol.
 */
export function esModoCajero(role: string): boolean {
  return !checkPermission(role as Role, "adelantos", "write");
}

/**
 * La clave del alta que hace un cajero se guarda con este prefijo: sin columna
 * nueva, así se sabe qué entregó un cajero (tope diario por persona) y la puerta
 * del «Reintentar firma» compara contra `cajero:<entregaKey>`.
 */
export const PREFIJO_CLAVE_CAJERO = "cajero:";

/** El cajero completa la firma del adelanto que acaba de dar, no de uno viejo. */
export const VENTANA_FIRMA_CAJERO_MS = 2 * 60 * 60 * 1000;
