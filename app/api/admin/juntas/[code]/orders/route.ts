import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { JuntasDB } from "@/lib/db/juntas.db";

/**
 * GET /api/admin/juntas/[code]/orders
 *
 * Pedidos de una junta para planificar la entrega agrupada (Fase A6): una junta
 * = una sola vuelta del repartidor. Solo admin (tenant del JWT).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { code } = await params;
  const junta = await JuntasDB.getByCode(auth.tenantId, code);
  if (!junta) {
    return NextResponse.json({ error: "Junta no encontrada" }, { status: 404 });
  }

  const orders = await JuntasDB.listOrdersForJunta(auth.tenantId, junta.id);
  return NextResponse.json({ junta, orders });
}
