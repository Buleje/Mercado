import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { PedidosOperacionDB } from "@/lib/db/pedidos-operacion.db";

/**
 * Lo que el detalle del pedido muestra de su salida (17-10):
 *  - `entrega`: el día y la franja que eligió el cliente al pagar en la tienda
 *    (`DeliverySlot`, se guarda desde el 17-10), o null si pidió «lo antes posible»;
 *  - `listo`: la marca «Listo para salir» de Preparación (KV), con quién, los
 *    bultos y lo que faltó, o null si nadie lo dejó listo.
 *
 * Sólo lee. Todo el panel (`requireAdmin` sin lista), como la Preparación.
 */

const IdSchema = z.string().min(1).max(64);

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "pedidos-entrega");
  if (rl) return rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const id = IdSchema.safeParse(req.nextUrl.searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "Falta el pedido." }, { status: 400 });
  try {
    const salida = await PedidosOperacionDB.salidaDe(auth.tenantId, id.data);
    if (!salida) return NextResponse.json({ error: "No encontramos ese pedido." }, { status: 404 });
    return NextResponse.json(salida);
  } catch (err) {
    logger.error("[pedidos/entrega] GET falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No pudimos traer la entrega del pedido." }, { status: 503 });
  }
}
