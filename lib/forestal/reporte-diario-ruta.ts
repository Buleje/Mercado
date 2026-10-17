import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { isSpecializationEnabled } from "@/lib/specializations";
import { logger } from "@/lib/logger";
import { ReportesActivosLlenoError, ReportesDiariosLlenoError } from "@/lib/db/forest-reporte-diario.db";
import { TopeDiarioError } from "@/lib/forestal/reporte-diario-envio";
import type { ZodError } from "zod";

/**
 * Lo común de las rutas `/api/admin/forestal/reportes-diarios/**` (ADR-439).
 *
 * Sólo admin y dueño: un reporte saca el libro del panel hacia correos y
 * teléfonos de terceros. `requireAdmin` deja pasar a `manager` por el bypass de
 * gestión aunque la ruta pida `["admin","owner"]` (security 2026-09-26), así
 * que el rol se vuelve a mirar acá, explícito.
 */
export const ROLES_REPORTES = ["admin", "owner"] as const;

export type AuthReportes = { tenantId: string; username: string; role: string; moduloHabilitado: boolean };

/**
 * `exigirModulo: false` sólo para VER, PAUSAR y BORRAR: un negocio al que le
 * apagaron el módulo CTP tiene que poder frenar un reporte que ya tenía, no
 * quedarse con un 403 (revisión 26-09). Crear, activar, vista previa y
 * «Enviar ahora» siguen pidiendo el módulo prendido.
 */
export async function autorizarReportes(
  req: NextRequest,
  { exigirModulo = true }: { exigirModulo?: boolean } = {},
): Promise<AuthReportes | NextResponse> {
  const auth = await requireAdmin(req, ROLES_REPORTES);
  if (auth instanceof NextResponse) return auth;
  if (!(ROLES_REPORTES as readonly string[]).includes(auth.role)) {
    return NextResponse.json(
      { error: "forbidden", message: "Solo el administrador o el dueño pueden ver y cambiar los reportes diarios." },
      { status: 403 },
    );
  }
  const ok = await isSpecializationEnabled(auth.tenantId, "spec:forestal:ctp-libro");
  if (!ok && exigirModulo) return moduloApagado();
  return { tenantId: auth.tenantId, username: auth.username, role: auth.role, moduloHabilitado: ok };
}

export function moduloApagado(mensaje = "El módulo CTP no está habilitado para este negocio."): NextResponse {
  return NextResponse.json({ error: "specialization_disabled", message: mensaje }, { status: 403 });
}

export async function leerJson(req: NextRequest): Promise<{ ok: true; body: unknown } | { ok: false; res: NextResponse }> {
  try {
    return { ok: true, body: await req.json() };
  } catch {
    return { ok: false, res: NextResponse.json({ error: "invalid_json", message: "El cuerpo no es JSON." }, { status: 400 }) };
  }
}

export function errorDeValidacion(err: ZodError): NextResponse {
  const issues = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
  return NextResponse.json({ error: "validation_error", message: issues[0]?.message ?? "Datos inválidos.", issues }, { status: 422 });
}

export function errorInterno(err: unknown, ctx: string, tenantId: string): NextResponse {
  if (err instanceof ReportesDiariosLlenoError || err instanceof ReportesActivosLlenoError) {
    return NextResponse.json({ error: "tope", message: err.message }, { status: 409 });
  }
  if (err instanceof TopeDiarioError) {
    return NextResponse.json({ error: "tope_diario", message: err.message }, { status: 429 });
  }
  logger.error(`[reportes-diarios.${ctx}] failed`, { error: String(err).slice(0, 300), tenantId });
  return NextResponse.json({ error: "internal_error", message: "No se pudo completar. Intenta de nuevo." }, { status: 500 });
}

export const SIN_CACHE = { "Cache-Control": "private, no-store" } as const;
