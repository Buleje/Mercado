import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { leerJson } from "@/lib/errores/sin-dato";
import { AgendaDB } from "@/lib/db/agenda.db";
import { FechaKeySchema, MarcarOcurrenciaSchema, primerMensaje } from "@/lib/agenda/schemas";
import { ROLES_LEER_AGENDA, puedeLeerAgenda } from "@/lib/admin/agenda-acceso";
import type { SessionPayload } from "@/lib/session";

/**
 * /api/admin/agenda/ocurrencias (ADR-501 §7) — marcar un día a mano.
 *
 * PUT    → `OcurrenciaDTO` (upsert por [tenantId, actividadId, fecha]).
 * DELETE ?actividadId&fecha → `{ ok: true }`: deshace la marca; el día vuelve a lo que diga la fuente.
 * Cajero/almacenero/analista sólo marcan las de su rol: una ajena responde 404 (AgendaDB).
 */

const DesmarcarSchema = z.object({ actividadId: z.string().trim().min(1).max(64), fecha: FechaKeySchema });

/** CSRF + límite + sesión: devuelve la sesión o la respuesta de rechazo (`Response`). */
async function entrar(req: NextRequest): Promise<SessionPayload | Response> {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const rl = applyRateLimit(req, "GENEROUS", "agenda-ocurrencias");
  if (rl) return rl;
  const auth = await requireAdmin(req, ROLES_LEER_AGENDA);
  if (auth instanceof NextResponse) return auth;
  if (!puedeLeerAgenda(auth.role)) return NextResponse.json({ error: "No tienes acceso a la agenda" }, { status: 403 });
  return auth;
}

export async function PUT(req: NextRequest) {
  const auth = await entrar(req);
  if (auth instanceof Response) return auth;

  const body = await leerJson(req);
  if (body === null) return NextResponse.json({ error: "Manda la actividad y el día" }, { status: 400 });
  const parsed = MarcarOcurrenciaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: primerMensaje(parsed.error) }, { status: 400 });

  try {
    const r = await AgendaDB.marcarOcurrencia(auth.tenantId, parsed.data, { rol: auth.role, usuario: auth.username });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json(r.valor);
  } catch (err) {
    logger.error("[agenda] marcar ocurrencia falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se guardó. Reintenta." }, { status: 503 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await entrar(req);
  if (auth instanceof Response) return auth;

  const q = req.nextUrl.searchParams;
  const parsed = DesmarcarSchema.safeParse({ actividadId: q.get("actividadId") ?? "", fecha: q.get("fecha") ?? "" });
  if (!parsed.success) return NextResponse.json({ error: primerMensaje(parsed.error) }, { status: 400 });

  try {
    const r = await AgendaDB.desmarcarOcurrencia(auth.tenantId, parsed.data.actividadId, parsed.data.fecha, {
      rol: auth.role,
      usuario: auth.username,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("[agenda] desmarcar ocurrencia falló", { tenantId: auth.tenantId, error: String(err) });
    return NextResponse.json({ error: "No se guardó. Reintenta." }, { status: 503 });
  }
}
