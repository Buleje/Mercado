import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { ColaboradoresDB, type ColaboradorRow } from "@/lib/db/rrhh-colaboradores.db";
import { aColaboradorDTO } from "@/lib/rrhh/dto";
import { RRHH_COMPLETO, RRHH_GESTION, nivelDeRol } from "@/lib/rrhh/roles";
import { colaboradorAccionSchema } from "@/lib/rrhh/schemas";
import type { NivelRrhh } from "@/lib/rrhh/tipos";
import { respuestaErrorColaborador } from "../_errores";

/** GET /api/rrhh/colaboradores/[id] — la ficha completa. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-lectura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_GESTION]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (!nivel || nivel === "marcar") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  try {
    const ficha = await ColaboradoresDB.ficha(auth.tenantId, id, nivel);
    if (!ficha) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(ficha, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[rrhh/colaboradores/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/** PATCH /api/rrhh/colaboradores/[id] — editar/cesar/reingresar/vincular/restaurar, una acción por request. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "rrhh-escritura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_GESTION]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (!nivel || nivel === "marcar") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "validation_error" }, { status: 422 });
  }
  const parsed = colaboradorAccionSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }
  const accion = parsed.data;

  const requiereCompleto =
    accion.action === "vincular_beneficiario" ||
    accion.action === "vincular_usuario" ||
    (accion.action === "reingresar" && accion.tarifa != null);
  if (requiereCompleto && nivel !== "completo") {
    return NextResponse.json({ error: "requiere_admin" }, { status: 403 });
  }

  try {
    let row: ColaboradorRow | null;
    switch (accion.action) {
      case "editar": {
        const { action: _action, ...patch } = accion;
        const res = await ColaboradoresDB.editar(auth.tenantId, id, patch, auth.username);
        row = res?.row ?? null;
        break;
      }
      case "cambiar_estado":
        row = await ColaboradoresDB.cambiarEstado(
          auth.tenantId,
          id,
          { estado: accion.estado, sinPagoDesde: accion.sinPagoDesde },
          auth.username,
        );
        break;
      case "cesar":
        row = await ColaboradoresDB.cesar(
          auth.tenantId,
          id,
          { fechaCese: accion.fechaCese, motivo: accion.motivo, confirmar: accion.confirmar },
          auth.username,
        );
        break;
      case "reingresar":
        row = await ColaboradoresDB.reingresar(auth.tenantId, id, { fecha: accion.fecha, tarifa: accion.tarifa }, auth.username);
        break;
      case "vincular_beneficiario":
        row = await ColaboradoresDB.vincularBeneficiario(auth.tenantId, id, accion.beneficiarioId, auth.username);
        break;
      case "vincular_usuario":
        row = await ColaboradoresDB.vincularUsuario(auth.tenantId, id, accion.adminUserId, auth.username);
        break;
      case "restaurar":
        row = await ColaboradoresDB.restaurar(auth.tenantId, id, auth.username);
        break;
    }
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    const nivelFicha: Exclude<NivelRrhh, "marcar"> = nivel === "completo" ? "completo" : "gestion";
    return NextResponse.json({ colaborador: aColaboradorDTO(row, nivelFicha) });
  } catch (e) {
    const mapeado = respuestaErrorColaborador(e);
    if (mapeado) return mapeado;
    logger.error("[rrhh/colaboradores/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/** DELETE /api/rrhh/colaboradores/[id] — baja lógica, sólo nivel completo. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "rrhh-escritura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const res = await ColaboradoresDB.eliminar(auth.tenantId, id, auth.username);
    if (!res) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true, marcasOcultas: res.marcasOcultas });
  } catch (e) {
    logger.error("[rrhh/colaboradores/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
