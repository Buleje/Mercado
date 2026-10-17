import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-retry";
import { logger } from "@/lib/logger";
import { SupplierReturnsDB } from "@/lib/db/supplier-returns.db";

const Query = z.object({ proveedorId: z.string().min(1).max(100) });

/**
 * GET /api/supplier-returns/origenes?proveedorId=<id> — de qué órdenes recibidas
 * de ese proveedor puede salir una devolución, con lo que todavía se puede
 * devolver de cada producto y su último costo (auditoría Compras C49/C51, 17-10).
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const parsed = Query.safeParse({ proveedorId: req.nextUrl.searchParams.get("proveedorId") ?? "" });
  if (!parsed.success) return NextResponse.json({ error: "Falta el proveedor." }, { status: 400 });
  try {
    const r = await withDbRetry(() => SupplierReturnsDB.origenes(auth.tenantId, parsed.data.proveedorId));
    return NextResponse.json(r);
  } catch (e) {
    logger.error("[supplier-returns/origenes] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No se pudieron traer las compras del proveedor." }, { status: 503 });
  }
}
