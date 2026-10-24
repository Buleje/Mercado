import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { CuentasColaboradorDB } from "@/lib/db/rrhh-cuentas.db";
import { RRHH_COMPLETO, nivelDeRol } from "@/lib/rrhh/roles";

/**
 * GET /api/rrhh/colaboradores/[id]/cuentas — «Sus cuentas»: las cuentas que la
 * misma persona tiene en Mi Plata, proveedores, clientes y comunidades, por su
 * documento o su celular. Muestra plata (fiado, saldos) y la ruta de vincular
 * es de admin/dueño (ADR-414 §7), así que va con el nivel `completo`: el
 * encargado pasa `requireAdmin` (bypass de gestión) y acá recibe 403.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const _rl = applyRateLimit(req, "GENEROUS", "rrhh-lectura");
  if (_rl) return _rl;
  const auth = await requireAdmin(req, [...RRHH_COMPLETO]);
  if (auth instanceof NextResponse) return auth;
  if (nivelDeRol(auth.role) !== "completo") return NextResponse.json({ error: "requiere_admin" }, { status: 403 });
  const { id } = await params;

  try {
    const r = await CuentasColaboradorDB.otras(auth.tenantId, id);
    if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json(r, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    logger.error("[rrhh/colaboradores/id/cuentas] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
