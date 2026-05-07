import { NextRequest, NextResponse } from "next/server";
import { SalesDB } from "@/lib/jsondb";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { withDbRetry } from "@/lib/db-retry";

// SECURITY 2026-05-05 (audit POS #1+#2):
// - GET previo ignoraba el `id` y retornaba TODAS las ventas (`SalesDB.getAll`).
// - POST previo creaba ventas sin re-hidratar precio desde DB ni validar
//   tenantId del producto (vector cerrado en `app/api/sales/route.ts`, pero
//   reabierto aquí). Cajero malicioso podía vender S/100 por S/0.01 si llamaba
//   este endpoint en vez del raíz.
// Fix: GET filtra por id + tenantId; POST eliminado — la creación va por
// `app/api/sales/route.ts` (precios DB + tx ACID).

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

  try {
    const sale = await withDbRetry(() => SalesDB.getById(auth.tenantId, id));
    if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
    return NextResponse.json(sale);
  } catch (e) {
    logger.error("[sales/id] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
