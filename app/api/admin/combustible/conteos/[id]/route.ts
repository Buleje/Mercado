import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { CuadernoCombustibleDB } from "@/lib/db/cuaderno-combustible.db";
import { ROLES_ANULAR, anularSchema, leerCuerpo } from "../../esquemas";

/** DELETE /api/admin/combustible/conteos/[id] { motivo } — anula el renglón (no se borra: el cuaderno es para SUNAT). ADR-533. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ROLES_ANULAR);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const b = await leerCuerpo(req, anularSchema);
  if (!b.ok) return b.res;
  try {
    const ok = await CuadernoCombustibleDB.anularConteo(auth.tenantId, id, b.data.motivo, auth.username);
    if (!ok) return NextResponse.json({ error: "No existe o ya estaba anulado" }, { status: 404 });
    return NextResponse.json({ data: { anulado: true, despues: await CuadernoCombustibleDB.despues(auth.tenantId) } });
  } catch (err) {
    logger.error("[combustible.anularConteo] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
