import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { logger } from "@/lib/logger";
import { MAX_PEDIDOS_HISTORIAL, PedidoHistorialDB } from "@/lib/db/pedido-historial.db";

/**
 * GET /api/orders/historial?ids=a,b,c — qué le pasó a cada pedido (cambios de
 * estado con quién y su nota, y las notas internas). Lo leen el detalle del
 * pedido (línea de tiempo y notas) y Archivados (columna «Cierre»).
 *
 * Panel, cualquier rol que ya ve Pedidos (mismo `requireAdmin` que
 * `GET /api/orders`). Pedidos de otro negocio no salen: filtra por el
 * `tenantId` del JWT.
 */
const IdsSchema = z
  .array(z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/))
  .min(1)
  .max(MAX_PEDIDOS_HISTORIAL);

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const crudo = req.nextUrl.searchParams.get("ids") ?? "";
  const parsed = IdsSchema.safeParse(crudo.split(",").map((s) => s.trim()).filter(Boolean));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pide entre 1 y 200 pedidos" }, { status: 400 });
  }

  try {
    const historial = await PedidoHistorialDB.deVarios(auth.tenantId, parsed.data);
    return NextResponse.json({ historial });
  } catch (e) {
    logger.error("[orders/historial] GET error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "No pudimos leer el historial" }, { status: 503 });
  }
}
