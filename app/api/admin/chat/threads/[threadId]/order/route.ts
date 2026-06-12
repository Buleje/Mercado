import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { ChatThreadsDB } from "@/lib/db/chat.db";
import { OrdersDB } from "@/lib/db/orders.db";
import { buildOrderContext } from "@/lib/chat/order-context";
import { logger } from "@/lib/logger";

/**
 * GET /api/admin/chat/threads/[threadId]/order — Tanda 4 · contexto del pedido.
 *
 * Devuelve el resumen del pedido del que trata el hilo (si nació de uno) para
 * fijarlo arriba de la conversación del vendedor. Se llama una vez al abrir el
 * hilo (no en el polling). null si el hilo no tiene pedido asociado.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "cajero", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const { threadId } = await params;

  try {
    const orderId = await ChatThreadsDB.getOrderId(auth.tenantId, threadId);
    if (!orderId) return NextResponse.json({ data: null });

    const order = await OrdersDB.getById(auth.tenantId, orderId);
    if (!order) return NextResponse.json({ data: null });

    return NextResponse.json({ data: buildOrderContext(order) });
  } catch (err) {
    logger.error("[chat/order] failed", { err: String(err), threadId });
    return NextResponse.json({ error: "Error del servidor" }, { status: 500 });
  }
}
