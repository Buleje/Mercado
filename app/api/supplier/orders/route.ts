import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSupplier } from "@/lib/require-supplier";
import { prisma } from "@/lib/prisma";
import { toErrorPayload } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const PAGE_SIZE = 20;

const querySchema = z.object({
  status: z.enum(["pendiente", "recibido", "parcial", "cancelado"]).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).default(1),
});

/**
 * GET /api/supplier/orders
 * Lista paginada de órdenes de compra dirigidas al proveedor autenticado.
 * Headers: X-Total-Count
 * Query: status?, from?, to?, page?
 */
export async function GET(req: NextRequest) {
  try {
    const supplier = await requireSupplier(req);
    if (!supplier) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { supplierId, tenantId } = supplier;

    const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
    const parsed = querySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { status, from, to, page } = parsed.data;
    const skip = (page - 1) * PAGE_SIZE;

    const where: Record<string, unknown> = { supplierId, tenantId };
    if (status) where.status = status;
    if (from || to) {
      where.createdAt = {
        ...(from && { gte: new Date(from) }),
        ...(to && { lte: new Date(to) }),
      };
    }

    const [total, orders] = await Promise.all([
      prisma.purchaseOrder.count({ where }),
      prisma.purchaseOrder.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: PAGE_SIZE,
        include: {
          items: {
            select: { id: true, name: true, quantity: true, unitCost: true, unit: true },
          },
        },
      }),
    ]);

    logger.debug("[SUPPLIER-ORDERS] fetched", { supplierId, total, page });

    const res = NextResponse.json(
      orders.map((o) => ({
        id: o.id,
        total: o.total,
        status: o.status,
        notes: o.notes,
        paymentMethod: o.paymentMethod,
        deliveryDate: o.deliveryDate?.toISOString() ?? null,
        discount: o.discount,
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        items: o.items,
      })),
    );
    res.headers.set("X-Total-Count", String(total));
    return res;
  } catch (err) {
    return NextResponse.json(toErrorPayload(err), { status: 500 });
  }
}
