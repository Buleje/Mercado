import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { leerJson } from "@/lib/errores/sin-dato";
import { AgendaDB } from "@/lib/db/agenda.db";
import { ActividadEditarSchema, primerMensaje } from "@/lib/agenda/schemas";
import { sincronizarActividad } from "@/lib/agenda/google/sync";
import { ROLES_ESCRIBIR_AGENDA, puedeEscribirAgenda } from "@/lib/admin/agenda-acceso";
import type { SessionPayload } from "@/lib/session";

/**
 * /api/admin/agenda/actividades/[id] (ADR-501 §7)
 *
 * PATCH  → `ActividadDTO` · 409 `{ error, actual }` si `version` ya no es la de la fila · 404 si no es de este negocio.
 * DELETE → `{ ok: true }` (borrado blando; las marcas quedan).
 */

type Ctx = { params: Promise<{ id: string }> };

/** CSRF + límite + sesión: devuelve la sesión o la respuesta de rechazo (`Response`). */
async function entrar(req: NextRequest): Promise<SessionPayload | Response> {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "MODERATE", "agenda-actividades");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES_ESCRIBIR_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeEscribirAgenda(auth.role)) {
    return NextResponse.json({ error: "Sólo el dueño o el encargado cambian la agenda" }, { status: 403 });
  }
  return auth;
}

function sincronizar(tenantId: string, id: string, accion: "guardar" | "borrar"): void {
  sincronizarActividad(tenantId, id, accion).catch((err) =>
    logger.error("[agenda] sync Google falló", { tenantId, accion, error: String(err) }),
  );
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await entrar(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  const body = await leerJson(req);
  if (body === null) return NextResponse.json({ error: "Manda lo que cambia" }, { status: 400 });
  const parsed = ActividadEditarSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: primerMensaje(parsed.error) }, { status: 400 });

  try {
    const r = await AgendaDB.editarActividad(auth.tenantId, id, parsed.data, auth.username);
    if (!r.ok) return NextResponse.json({ error: r.error, ...(r.actual ? { actual: r.actual } : {}) }, { status: r.status });
    const { actividad, antes } = r.valor;
    if (actividad.canales.includes("google")) sincronizar(auth.tenantId, id, "guardar");
    else if (antes.canales.includes("google")) sincronizar(auth.tenantId, id, "borrar");
    return NextResponse.json(actividad);
  } catch (err) {
    logger.error("[agenda] editar actividad falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se guardó. Reintenta." }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await entrar(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;

  try {
    const r = await AgendaDB.borrarActividad(auth.tenantId, id, auth.username);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    if (r.valor.canales.includes("google")) sincronizar(auth.tenantId, id, "borrar");
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[agenda] borrar actividad falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se guardó. Reintenta." }, { status: 503 });
  }
}
