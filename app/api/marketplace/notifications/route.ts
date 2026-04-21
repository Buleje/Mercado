import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * GET /api/marketplace/notifications?customerId=xxx
 *
 * Devuelve las notificaciones scoped al customer logueado. Cada usuario
 * ve solo sus propias notificaciones (pedidos suyos, ofertas de bodegas
 * que compró, mensajes a él).
 *
 * Estado actual: placeholder que retorna lista vacía. Cuando se implemente
 * el modelo `Notification` en Prisma, reemplazar el `return []` por un
 * `NotificationsDB.listForCustomer(tenantId, customerId)`.
 *
 * IMPORTANTE: validamos con safeParse (regla del proyecto — nunca .parse).
 */
const QuerySchema = z.object({
  customerId: z.string().min(1),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const parsed = QuerySchema.safeParse({
    customerId: searchParams.get("customerId"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { data: [], error: "invalid_params" },
      { status: 400 },
    );
  }

  // TODO: reemplazar por query real cuando exista el modelo Notification.
  // Ejemplo futuro:
  //   const notifs = await NotificationsDB.listForCustomer(
  //     tenantId,
  //     parsed.data.customerId,
  //     { limit: 20 },
  //   );

  return NextResponse.json({ data: [] });
}
