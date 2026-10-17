import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { ColaboradoresDB } from "@/lib/db/rrhh-colaboradores.db";
import { aTarifaDTO } from "@/lib/rrhh/dto";
import { RRHH_COMPLETO } from "@/lib/rrhh/roles";
import { tarifaGuardarSchema } from "@/lib/rrhh/schemas";
import { respuestaErrorColaborador } from "../../_errores";

/** GET /api/rrhh/colaboradores/[id]/tarifas — la línea de tiempo completa (incluye SIN_PAGO). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-lectura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    if (!(await ColaboradoresDB.existe(auth.tenantId, id))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const mapa = await ColaboradoresDB.tarifasDe(auth.tenantId, [id]);
    const tarifas = (mapa.get(id) ?? []).map(aTarifaDTO);
    return NextResponse.json({ tarifas }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[rrhh/colaboradores/id/tarifas] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/** PUT /api/rrhh/colaboradores/[id]/tarifas — nueva versión (o corrige la de esa misma fecha). */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "rrhh-escritura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "validation_error" }, { status: 422 });
  }
  const parsed = tarifaGuardarSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }

  try {
    if (!(await ColaboradoresDB.existe(auth.tenantId, id))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const tarifas = await ColaboradoresDB.guardarTarifa(auth.tenantId, id, parsed.data, auth.username);
    return NextResponse.json({ tarifas: tarifas.map(aTarifaDTO) });
  } catch (e) {
    const mapeado = respuestaErrorColaborador(e);
    if (mapeado) return mapeado;
    logger.error("[rrhh/colaboradores/id/tarifas] PUT error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/** DELETE /api/rrhh/colaboradores/[id]/tarifas?tarifaId= — baja lógica de UNA versión. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "rrhh-escritura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const tarifaId = req.nextUrl.searchParams.get("tarifaId");
  if (!tarifaId) return NextResponse.json({ error: "validation_error" }, { status: 422 });

  try {
    const tarifas = await ColaboradoresDB.quitarTarifa(auth.tenantId, id, tarifaId, auth.username);
    if (!tarifas) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ tarifas: tarifas.map(aTarifaDTO) });
  } catch (e) {
    logger.error("[rrhh/colaboradores/id/tarifas] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
