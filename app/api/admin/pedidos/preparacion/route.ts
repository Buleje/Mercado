import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/require-admin";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { PedidosOperacionDB } from "@/lib/db/pedidos-operacion.db";
import { limaDateKey } from "@/lib/utils";

/**
 * Preparación de pedidos (N02, 17-10).
 *
 * GET  → los pedidos confirmados o en preparación, con sus líneas y lo juntado,
 *        y la agenda: los pedidos en marcha con día de entrega (N01).
 * POST → anota lo juntado de un pedido (KV, no cambia el estado del pedido).
 *
 * Leer: todo el panel (`requireAdmin` sin lista). Anotar lo juntado: quien
 * prepara (almacenero) y quien vende (cajero, dueño de tienda); admin, dueño y
 * encargado pasan solos. Pasar el pedido a «preparando» o «en camino» sigue
 * siendo `PATCH /api/orders/[id]`, con sus roles.
 */

const CambioSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("linea"), itemId: z.number().int().positive(), preparada: z.number().int().min(0).max(1_000_000) }),
  z.object({ accion: z.literal("todo") }),
  z.object({ accion: z.literal("listo"), bultos: z.number().int().min(1).max(999).nullable() }),
  z.object({ accion: z.literal("deshacer-listo") }),
  z.object({ accion: z.literal("reiniciar") }),
]);

const PostSchema = z.object({
  pedidoId: z.string().min(1).max(64),
  cambio: CambioSchema,
});

export async function GET(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "pedidos-preparacion");
  if (rl) return rl;
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const ayer = limaDateKey(new Date(Date.now() - 86_400_000));
    const [{ pedidos, truncado }, agenda] = await Promise.all([
      PedidosOperacionDB.porPreparar(auth.tenantId),
      PedidosOperacionDB.agenda(auth.tenantId, ayer),
    ]);
    return NextResponse.json({ pedidos, truncado, agenda });
  } catch (err) {
    logger.error("[pedidos/preparacion] GET falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No pudimos traer los pedidos por preparar." }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const rl = applyRateLimit(req, "GENEROUS", "pedidos-preparacion-w");
  if (rl) return rl;
  const auth = await requireAdmin(req, ["cajero", "almacenero", "tienda_owner"]);
  if (auth instanceof NextResponse) return auth;
  const cuerpo: unknown = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json({ error: "Lo que mandaste no se entiende: recarga la lista e intenta de nuevo." }, { status: 400 });
  }
  try {
    const r = await PedidosOperacionDB.cambiarAvance(auth.tenantId, parsed.data.pedidoId, parsed.data.cambio, auth.username);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ avance: r.avance });
  } catch (err) {
    logger.error("[pedidos/preparacion] POST falló", { error: String(err), tenantId: auth.tenantId });
    return NextResponse.json({ error: "No se guardó lo juntado: intenta de nuevo." }, { status: 503 });
  }
}
