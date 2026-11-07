import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { logAudit, type AuditAction } from "@/lib/audit-logger";
import { RRHH_COMPLETO } from "@/lib/rrhh/roles";
import { ErrorContable } from "@/lib/db/contabilidad.db";
import { hoyDeLima, type OpcionesLectura } from "@/lib/db/resultado-negocio.db";
import { ROLES_CIERRE, ROLES_CONTABILIDAD } from "@/lib/contabilidad/tipos";

/**
 * Lo común de las rutas de la Contabilidad (ADR-529): sesión, permisos,
 * lectura de query/body con Zod y el error en la frase de la persona.
 * Respuesta = objeto pelado; error = `{ error }` con 400/403/404/409/503.
 */

export interface SesionContable {
  tenantId: string;
  username: string;
  role: string;
  hoy: string;
  opciones: OpcionesLectura;
}

/** `cierre` = escribir (asientos, plan, cerrar/reabrir, ajustes): solo admin y dueño (el encargado entra por el bypass de `requireAdmin`, se frena acá). */
export async function sesion(req: NextRequest, cierre = false): Promise<SesionContable | NextResponse> {
  const auth = await requireAdmin(req, [...(cierre ? ROLES_CIERRE : ROLES_CONTABILIDAD)]);
  if (auth instanceof NextResponse) return auth;
  if (cierre && !(ROLES_CIERRE as readonly string[]).includes(auth.role)) {
    return NextResponse.json({ error: "Solo el administrador o el dueño pueden anotar asientos, cerrar meses y cambiar el plan o los ajustes." }, { status: 403 });
  }
  return {
    tenantId: auth.tenantId,
    username: auth.username,
    role: auth.role,
    hoy: hoyDeLima().hoy,
    // Lo ganado por persona solo lo ve quien ve la planilla completa.
    opciones: { verPlanilla: RRHH_COMPLETO.includes(auth.role) },
  };
}

export function leerQuery<T>(req: NextRequest, esquema: ZodType<T>): T | NextResponse {
  const sp = new URL(req.url).searchParams;
  const crudo: Record<string, string> = {};
  for (const [k, v] of sp.entries()) if (v !== "") crudo[k] = v;
  const r = esquema.safeParse(crudo);
  if (r.success) return r.data;
  return NextResponse.json({ error: r.error.issues[0]?.message ?? "Datos inválidos" }, { status: 400 });
}

export async function leerBody<T>(req: NextRequest, esquema: ZodType<T>): Promise<T | NextResponse> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo no es JSON." }, { status: 400 });
  }
  const r = esquema.safeParse(json);
  if (r.success) return r.data;
  const i = r.error.issues[0];
  return NextResponse.json({ error: i ? `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}` : "Datos inválidos" }, { status: 400 });
}

/** Corre la lectura/escritura; ErrorContable → su status; lo demás → 503 con log. */
export async function responder<T>(ctx: string, s: SesionContable, fn: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await fn(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof ErrorContable) return NextResponse.json({ error: e.message }, { status: e.status });
    logger.error(`[contabilidad/${ctx}] error`, { err: e instanceof Error ? e.message : String(e), tenantId: s.tenantId });
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}

export function auditar(req: NextRequest, s: SesionContable, action: AuditAction, detail: string, entityId?: string): void {
  logAudit({ req, action, entity: "Settings", entityId, detail: `[contabilidad] ${detail}`, user: s.username, tenantId: s.tenantId });
}
