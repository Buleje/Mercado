import "server-only";
import { NextResponse } from "next/server";

/** Quiénes escriben la plata de una guía (ADR-437): costo, a quién se le paga, gastos. */
export const ROLES_ESCRIBEN_PLATA_GUIA = ["admin", "owner"] as const;

/**
 * `requireAdmin` deja pasar a `manager` por el bypass de gestión
 * (`lib/require-admin.ts`, «management tier»): aunque la ruta pida
 * `["admin", "owner"]`, un encargado entra. Escribir la plata de una guía es
 * sólo de admin y dueño, igual que liquidar
 * (`/api/adelantos/cuentas/liquidaciones`). Security 2026-09-26: un encargado
 * podía valorizar una guía y anotar la madera en la cuenta de un proveedor.
 *
 * `null` = puede seguir; si no, el 403 que devuelve la ruta tal cual.
 */
export function soloAdminODueno(
  role: string,
  /** Qué se quería hacer, para el 403 («quitar un documento de la guía»). */
  que = "cambiar la plata de una guía",
): NextResponse | null {
  return (ROLES_ESCRIBEN_PLATA_GUIA as readonly string[]).includes(role)
    ? null
    : NextResponse.json(
        { error: "forbidden", message: `Solo el administrador o el dueño pueden ${que}.` },
        { status: 403 },
      );
}
