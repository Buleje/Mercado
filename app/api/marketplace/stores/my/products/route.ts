import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

/**
 * GET /api/marketplace/stores/my/products
 * Lista todos los productos de la tienda del tenant (activos e inactivos).
 * El admin ve todos para poder activar/desactivar.
 */
export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const store = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId },
      select: { id: true },
    });

    if (!store) {
      return NextResponse.json([]);
    }

    const storeProducts = await prisma.storeProduct.findMany({
      where: { storeId: store.id },
      include: {
        product: {
          select: { name: true, stock: true, barcode: true },
        },
      },
      orderBy: { product: { name: "asc" } },
    });

    const result = storeProducts.map((sp) => ({
      id: sp.id,
      name: sp.product.name,
      isActive: sp.isActive,
      retailPrice: Number(sp.retailPrice),
      wholesalePrice: Number(sp.wholesalePrice ?? 0),
      stock: sp.product.stock ?? 0,
      sku: sp.product.barcode ?? "",
    }));

    return NextResponse.json(result);
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
