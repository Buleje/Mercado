import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { assertCsrf } from "@/lib/auth/csrf";
import { logger } from "@/lib/logger";
import { CuadernoCombustibleDB } from "@/lib/db/cuaderno-combustible.db";
import { ROLES_ANOTAR, ROLES_ANULAR, anularSchema, leerCuerpo } from "../../esquemas";

/**
 * GET    /api/admin/combustible/vales/[id]            → { firma } (PNG data URL o null; la lista no la trae por peso)
 * DELETE /api/admin/combustible/vales/[id] { motivo } → anula el vale (deja de contar en el cuaderno y en la máquina). ADR-533.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ROLES_ANOTAR);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    return NextResponse.json({ data: { firma: await CuadernoCombustibleDB.firmaDeVale(auth.tenantId, id) } });
  } catch (err) {
    logger.error("[combustible.firma] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = assertCsrf(req);
  if (csrf) return csrf;
  const auth = await requireAdmin(req, ROLES_ANULAR);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const b = await leerCuerpo(req, anularSchema);
  if (!b.ok) return b.res;
  try {
    const ok = await CuadernoCombustibleDB.anularVale(auth.tenantId, id, b.data.motivo, auth.username);
    if (!ok) return NextResponse.json({ error: "No existe o ya estaba anulado" }, { status: 404 });
    return NextResponse.json({ data: { anulado: true, despues: await CuadernoCombustibleDB.despues(auth.tenantId) } });
  } catch (err) {
    logger.error("[combustible.anularVale] failed", { error: String(err), tenantId: auth.tenantId, id });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
