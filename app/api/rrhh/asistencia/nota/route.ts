import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { limaDateKey } from "@/lib/utils";
import { logActivity } from "@/lib/activity-logger";
import { AsistenciaNotasDB, ColaboradorNoEncontradoError, DiaMarcadoError } from "@/lib/db/asistencia-notas.db";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { revisarDiaDeMarca } from "@/lib/rrhh/asistencia";
import { esFechaKey, fechaKeyDeDate } from "@/lib/rrhh/fechas";
import { RRHH_MARCAR, nivelDeRol, ventanaDeMarcado } from "@/lib/rrhh/roles";
import { borrarNotaAsistenciaSchema, notaAsistenciaSchema } from "@/lib/rrhh/schemas";
import type { FechaKey } from "@/lib/rrhh/tipos";

/**
 * Nota del día SIN marca (23-10, «sólo una nota, sin poner presente ni nada»).
 * Mismos roles (`RRHH_MARCAR`) y misma ventana que marcar asistencia: la nota
 * de un día que el rol ya no puede corregir tampoco se toca. La persona tiene
 * que ser del negocio del JWT (404 si no). Un día con marca viva lleva la nota
 * en la marca (`PUT /api/rrhh/asistencia`): acá da 409.
 */

type Puerta =
  | { ok: true; tenantId: string; username: string }
  | { ok: false; res: NextResponse };

/** Auth + rol + persona del negocio + ventana — lo mismo para guardar y borrar. */
async function abrirPuerta(req: NextRequest, colaboradorId: string, fecha: FechaKey): Promise<Puerta> {
  const auth = await requireAdmin(req, [...RRHH_MARCAR]);
  if (auth instanceof NextResponse) return { ok: false, res: auth };
  const nivel = nivelDeRol(auth.role);
  if (!nivel) return { ok: false, res: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  if (!esFechaKey(fecha)) return { ok: false, res: NextResponse.json({ error: "validation_error" }, { status: 422 }) };

  const persona = await ColaboradoresDB.obtener(auth.tenantId, colaboradorId);
  if (!persona) return { ok: false, res: NextResponse.json({ error: "colaborador_no_encontrado" }, { status: 404 }) };

  const hoy = limaDateKey();
  const rechazo = revisarDiaDeMarca(fecha, {
    colaborador: {
      fechaIngreso: persona.fechaIngreso ? fechaKeyDeDate(persona.fechaIngreso) : null,
      fechaCese: persona.fechaCese ? fechaKeyDeDate(persona.fechaCese) : null,
      eliminado: false,
    },
    hoy,
    ventana: ventanaDeMarcado(nivel, auth.role, hoy),
  });
  if (rechazo) {
    const status = rechazo.motivo === "fuera_de_ventana" ? 403 : 422;
    return { ok: false, res: NextResponse.json({ error: rechazo.motivo, message: rechazo.message }, { status }) };
  }
  return { ok: true, tenantId: auth.tenantId, username: auth.username };
}

function registrar(accion: string, detalle: string, colaboradorId: string, usuario: string, tenantId: string): void {
  logActivity(accion, "AsistenciaNota", detalle, colaboradorId, usuario, undefined, tenantId).catch((err) =>
    logger.error("[rrhh/asistencia/nota] logActivity falló", { error: String(err) }),
  );
}

/** PUT /api/rrhh/asistencia/nota — `{ colaboradorId, fecha, nota }`: crea o edita la nota de ese día. */
export async function PUT(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-asistencia");
  if (_rl) return _rl;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = notaAsistenciaSchema.safeParse(raw);
  if (!parsed.success) {
    // La sesión se mira igual primero: sin sesión es 401, nunca 422.
    const auth = await requireAdmin(req, [...RRHH_MARCAR]);
    if (auth instanceof NextResponse) return auth;
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }
  const { colaboradorId, fecha, nota } = parsed.data;

  const puerta = await abrirPuerta(req, colaboradorId, fecha);
  if (!puerta.ok) return puerta.res;

  try {
    const guardada = await AsistenciaNotasDB.guardar(puerta.tenantId, { colaboradorId, fecha, nota, autor: puerta.username });
    registrar("rrhh_asistencia_nota", `Anotó la nota del ${fecha}`, colaboradorId, puerta.username, puerta.tenantId);
    return NextResponse.json({ nota: guardada });
  } catch (e) {
    if (e instanceof DiaMarcadoError) {
      return NextResponse.json({ error: "dia_marcado", message: "Ese día ya tiene marca: la nota se escribe en la marca." }, { status: 409 });
    }
    if (e instanceof ColaboradorNoEncontradoError) {
      return NextResponse.json({ error: "colaborador_no_encontrado" }, { status: 404 });
    }
    logger.error("[rrhh/asistencia/nota] PUT error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/** DELETE /api/rrhh/asistencia/nota?colaboradorId=&fecha= — borra la nota suelta de ese día. */
export async function DELETE(req: NextRequest) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-asistencia");
  if (_rl) return _rl;

  const { searchParams } = req.nextUrl;
  const parsed = borrarNotaAsistenciaSchema.safeParse({
    colaboradorId: searchParams.get("colaboradorId") ?? undefined,
    fecha: searchParams.get("fecha") ?? undefined,
  });
  if (!parsed.success) {
    const auth = await requireAdmin(req, [...RRHH_MARCAR]);
    if (auth instanceof NextResponse) return auth;
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }
  const { colaboradorId, fecha } = parsed.data;

  const puerta = await abrirPuerta(req, colaboradorId, fecha);
  if (!puerta.ok) return puerta.res;

  try {
    const borradas = await AsistenciaNotasDB.borrar(puerta.tenantId, colaboradorId, fecha);
    if (borradas > 0) registrar("rrhh_asistencia_nota_borrar", `Borró la nota del ${fecha}`, colaboradorId, puerta.username, puerta.tenantId);
    return NextResponse.json({ borradas });
  } catch (e) {
    logger.error("[rrhh/asistencia/nota] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
