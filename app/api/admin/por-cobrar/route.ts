import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { PorCobrarDB } from "@/lib/db/por-cobrar.db";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/por-cobrar
 * Resumen consolidado de cuentas por cobrar (Fiados + Préstamos + Adelantos).
 * Solo lectura, tenant-scoped vía requireAdmin.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const summary = await PorCobrarDB.getSummary(auth.tenantId);
    return NextResponse.json(summary);
  } catch (e) {
    logger.error("[por-cobrar GET] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
