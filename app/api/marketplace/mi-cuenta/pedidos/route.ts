import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { CustomerOrdersDB } from "@/lib/db/customer-orders.db";
import { applyRateLimit } from "@/lib/rate-limit";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const QuerySchema = z.object({
  phone: z.string().min(6).max(20),
  tenantId: z.string().min(1).default("main"),
});

/**
 * GET /api/marketplace/mi-cuenta/pedidos?phone=xxx&tenantId=main
 *
 * Endpoint público ligero (autenticacion por telefono, igual que reorder).
 * Retorna pedidos del cliente para la pagina "Mi Cuenta > Pedidos".
 */
export async function GET(req: NextRequest) {
  const limited = applyRateLimit(req, "MODERATE", "mi-cuenta-pedidos");
  if (limited) return limited;

  const traceId = newTraceId();

  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      phone: searchParams.get("phone") ?? "",
      tenantId: searchParams.get("tenantId") ?? "main",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { orders: [], error: "Parametros invalidos" },
        { status: 400 },
      );
    }

    const { phone, tenantId } = parsed.data;
    const orders = await CustomerOrdersDB.listByCustomer(tenantId, phone);

    // MK-28: derivar storeSlug del tenant — usamos UNA sola query batched.
    const store = await prisma.store
      .findFirst({ where: { tenantId }, select: { slug: true } })
      .catch((e: unknown) => {
        console.warn("[mi-cuenta/pedidos] store lookup failed:", e);
        return null;
      });
    const storeSlug = store?.slug ?? tenantId;

    const result = orders.map((o) => ({
      id: o.id,
      total: o.total,
      status: o.status,
      itemsCount: o.items.length,
      storeSlug,
      items: o.items.map((i) => ({
        productId: i.id,
        name: i.name,
        price: i.price,
        quantity: i.quantity,
        unit: i.unit,
        image: i.image,
      })),
      createdAt: o.createdAt,
    }));

    return NextResponse.json({ orders: result });
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
