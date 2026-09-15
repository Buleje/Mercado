import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { PuestosDB, NombreDePuestoDuplicadoError } from "@/lib/db/rrhh-puestos.db";
import { aPuestoDTO } from "@/lib/rrhh/dto";
import { RRHH_GESTION, nivelDeRol } from "@/lib/rrhh/roles";
import { puestoSchema } from "@/lib/rrhh/schemas";

const puestoPatchSchema = puestoSchema.partial();

/** PATCH /api/rrhh/puestos/[id] */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "rrhh-escritura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_GESTION]);
  if (auth instanceof NextResponse) return auth;
  const nivel = nivelDeRol(auth.role);
  if (!nivel) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "validation_error" }, { status: 422 });
  }
  const parsed = puestoPatchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }
  if (parsed.data.tarifaSugerida !== undefined && nivel !== "completo") {
    return NextResponse.json({ error: "tarifa_requiere_admin" }, { status: 403 });
  }

  try {
    const row = await PuestosDB.actualizar(auth.tenantId, id, parsed.data, auth.username);
    if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ puesto: aPuestoDTO(row, nivel, row.personas) });
  } catch (e) {
    if (e instanceof NombreDePuestoDuplicadoError) {
      return NextResponse.json({ error: "nombre_duplicado", ...e.existente }, { status: 409 });
    }
    logger.error("[rrhh/puestos/id] PATCH error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

/** DELETE /api/rrhh/puestos/[id] — baja lógica; bloqueado si lo usa alguien no cesado. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const _rl = applyRateLimit(req, "MODERATE", "rrhh-escritura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_GESTION]);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  try {
    const res = await PuestosDB.eliminar(auth.tenantId, id, auth.username);
    if (!res) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (!res.ok) return NextResponse.json({ error: "puesto_en_uso", n: res.enUso }, { status: 409 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    logger.error("[rrhh/puestos/id] DELETE error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
