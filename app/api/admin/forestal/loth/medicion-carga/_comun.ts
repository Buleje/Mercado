import { NextResponse } from "next/server";
import type { z } from "zod";
import type { AdminRole } from "@/lib/session";
import { isSpecializationEnabled } from "@/lib/specializations";

/**
 * Lo común de /api/admin/forestal/loth/medicion-carga/** (16-10, F3).
 *
 * Mide y guarda el que está en el monte (almacenero o encargado del
 * campamento), la oficina la usa: los mismos roles que los papeles de la guía.
 * `tenantId` SIEMPRE del JWT.
 */
export const ROLES_MEDICION_CARGA: readonly AdminRole[] = ["admin", "almacenero", "owner"];

export async function especializacionLoth(tenantId: string): Promise<NextResponse | null> {
  const ok = await isSpecializationEnabled(tenantId, "spec:forestal:loth-libro");
  return ok ? null : NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
}

/** 400 con el primer mensaje legible del esquema. */
export function validacion(issues: readonly z.core.$ZodIssue[]): NextResponse {
  const message = issues.find((i) => i.message && !i.message.startsWith("Invalid"))?.message;
  return NextResponse.json({ error: "validation_error", ...(message ? { message } : {}), issues: issues.slice(0, 5) }, { status: 400 });
}

/** La clave del tenant está tomada: otra PC guarda en este instante. Se reintenta, no se pisa. */
export const ocupado = (): NextResponse =>
  NextResponse.json({ error: "ocupado", message: "Otra PC está guardando cargas en este momento. Vuelve a intentar en unos segundos." }, { status: 409 });
