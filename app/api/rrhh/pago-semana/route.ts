import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { PagoSemanaError, PagosSemanaDB } from "@/lib/db/rrhh-pagos.db";
import { RRHH_COMPLETO, nivelDeRol } from "@/lib/rrhh/roles";
import { semanaDe } from "@/lib/rrhh/fechas";
import type { AdminRole } from "@/lib/session";

/*
 * El pago de la semana de RRHH › Asistencia (Brandon 24-10). Lleva lo ganado y
 * las tarifas, así que es del nivel `completo` (admin, dueño), como `/api/rrhh/ganado`
 * debería ser (ADR-414 §7: el encargado no ve tarifas ni ganado). `requireAdmin`
 * deja pasar al manager siempre (bypass de gestión): por eso el `nivelDeRol`.
 */

const fechaKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD");

const PagarSchema = z.object({
  colaboradorId: z.string().min(1).max(40),
  /** El lunes de la semana que se paga. */
  desde: fechaKey,
  /** Sólo si le falta definir su pago (sin tarifa): lo que el dueño escribió. */
  montoManual: z.number().positive().max(1_000_000).nullable().optional(),
  metodo: z.enum(["efectivo", "yape", "plin", "transferencia"]),
  saleDeCaja: z.boolean(),
  /** El neto que vio en pantalla: si el servidor calcula otro, 409 con los números nuevos. */
  netoEsperado: z.number().min(0).max(1_000_000),
});

const DeshacerSchema = z.object({ colaboradorId: z.string().min(1).max(40), desde: fechaKey });

/** `null` = puede; si no, el 403 (el encargado entra a RRHH pero no a la plata del sueldo). */
function soloCompleto(role: AdminRole): NextResponse | null {
  return nivelDeRol(role) === "completo"
    ? null
    : NextResponse.json({ error: "requiere_admin", message: "El pago del personal lo ve y lo hace el administrador o el dueño." }, { status: 403 });
}

function respuestaDeError(e: unknown, ctx: string): NextResponse {
  if (e instanceof PagoSemanaError) {
    return NextResponse.json({ ...e.extra, error: e.code, message: e.message }, { status: e.status });
  }
  logger.error(`[rrhh/pago-semana] ${ctx} error`, { err: e instanceof Error ? e.message : String(e) });
  return NextResponse.json({ error: "Database error" }, { status: 503 });
}

async function leerJson(req: NextRequest): Promise<{ ok: true; raw: unknown } | { ok: false }> {
  try {
    return { ok: true, raw: await req.json() };
  } catch {
    return { ok: false };
  }
}

/** GET /api/rrhh/pago-semana?semana=AAAA-MM-DD — la tira del pago (cualquier día de esa semana; sin nada, la de hoy). */
export async function GET(req: NextRequest) {
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-lectura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloCompleto(auth.role);
  if (prohibido) return prohibido;

  const pedido = req.nextUrl.searchParams.get("semana");
  const dia = fechaKey.safeParse(pedido ?? limaDateKey());
  if (!dia.success) return NextResponse.json({ error: "validation_error", issues: dia.error.issues }, { status: 422 });
  try {
    const semana = await PagosSemanaDB.semana(auth.tenantId, semanaDe(dia.data).desde);
    return NextResponse.json(semana, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return respuestaDeError(e, "GET");
  }
}

/** POST /api/rrhh/pago-semana — «Pagado»: gasto en Mi Plata + adelantos descontados + caja, en una transacción. */
export async function POST(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "rrhh-escritura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloCompleto(auth.role);
  if (prohibido) return prohibido;

  const body = await leerJson(req);
  if (!body.ok) return NextResponse.json({ error: "validation_error" }, { status: 422 });
  const parsed = PagarSchema.safeParse(body.raw);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });

  try {
    const r = await PagosSemanaDB.pagar(auth.tenantId, parsed.data, auth.username);
    if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(r, { status: r.repetido ? 200 : 201 });
  } catch (e) {
    return respuestaDeError(e, "POST");
  }
}

/** DELETE /api/rrhh/pago-semana — deshacer el pago: reabre los adelantos, borra el gasto y devuelve el neto a la caja abierta. */
export async function DELETE(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "rrhh-escritura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
  if (auth instanceof NextResponse) return auth;
  const prohibido = soloCompleto(auth.role);
  if (prohibido) return prohibido;

  const body = await leerJson(req);
  if (!body.ok) return NextResponse.json({ error: "validation_error" }, { status: 422 });
  const parsed = DeshacerSchema.safeParse(body.raw);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });

  try {
    const r = await PagosSemanaDB.deshacer(auth.tenantId, parsed.data.colaboradorId, parsed.data.desde, auth.username);
    if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(r);
  } catch (e) {
    return respuestaDeError(e, "DELETE");
  }
}
