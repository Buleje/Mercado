import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-retry";
import { logger } from "@/lib/logger";
import { CuentasPorPagarDB } from "@/lib/db/cuentas-por-pagar.db";

const Query = z.object({ proveedor: z.string().min(1).max(100) });

/**
 * GET /api/payables/origenes?proveedor=<id> — las órdenes del proveedor que
 * todavía no tienen su cuenta por pagar (C41): de dónde puede salir una deuda
 * nueva o con qué orden conciliar una cuenta cargada a mano.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = Query.safeParse({ proveedor: req.nextUrl.searchParams.get("proveedor") ?? "" });
  if (!parsed.success) return NextResponse.json({ error: "Falta el proveedor." }, { status: 400 });
  try {
    const ordenes = await withDbRetry(() => CuentasPorPagarDB.ordenesSinCuenta(auth.tenantId, parsed.data.proveedor));
    return NextResponse.json({ ordenes });
  } catch (e) {
    logger.error("[payables/origenes] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudieron traer las órdenes del proveedor." }, { status: 503 });
  }
}
