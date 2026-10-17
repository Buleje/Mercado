import "server-only";
import { NextRequest, NextResponse } from "next/server";
import type { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import type { SessionPayload } from "@/lib/session";
import { PlanDocumentosError } from "@/lib/db/forest-plan-documentos.db";
import { ROLES_ESCRITURA_DOCS_PLAN, ROLES_LECTURA_DOCS_PLAN } from "@/lib/forestal/plan-documentos-tipos";

/**
 * Lo común a las rutas de «Documentos del plan» (ADR-467). No es una ruta: Next
 * sólo publica los `route.ts`.
 *
 * La puerta espeja `app/api/admin/forestal/plan/route.ts`, que es el módulo del
 * que cuelgan estos papeles: leer admin/almacenero/owner, escribir admin/owner,
 * límite GENEROUS y el guard de especialización del Libro TH. Mismo orden que
 * allá (sesión → límite → especialización): sin sesión, 401 siempre.
 */
export async function entrar(req: NextRequest, modo: "leer" | "escribir"): Promise<SessionPayload | Response> {
  const auth = await requireAdmin(req, modo === "leer" ? ROLES_LECTURA_DOCS_PLAN : ROLES_ESCRITURA_DOCS_PLAN);
  if (auth instanceof NextResponse) return auth;
  const rl = await applyRateLimit(req, "GENEROUS", "loth-plan-documentos");
  if (rl) return rl;
  if (!(await isSpecializationEnabled(auth.tenantId, "spec:forestal:loth-libro"))) {
    return NextResponse.json({ error: "specialization_disabled" }, { status: 403 });
  }
  return auth;
}

/** El cuerpo validado con el esquema del contrato, o la respuesta 400. */
export async function cuerpo<S extends z.ZodType>(req: NextRequest, esquema: S): Promise<z.infer<S> | NextResponse> {
  let crudo: unknown;
  try {
    crudo = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = esquema.safeParse(crudo);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 400 });
  }
  return parsed.data;
}

/** Un rechazo del dominio sale con su código y su mensaje; lo demás es un 500 con log. */
export function responderError(err: unknown, donde: string, tenantId: string): NextResponse {
  if (err instanceof PlanDocumentosError) {
    return NextResponse.json({ error: err.codigo, message: err.message }, { status: err.status });
  }
  logger.error(`[plan-documentos.${donde}] failed`, { error: String(err), tenantId });
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
