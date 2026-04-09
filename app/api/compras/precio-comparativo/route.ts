import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId ?? "main";
  const productId = req.nextUrl.searchParams.get("productId");

  if (!productId || isNaN(Number(productId))) {
    return NextResponse.json({ error: "productId requerido" }, { status: 400 });
  }

  try {
    const items = await prisma.purchaseItem.findMany({
      where: {
        productId: Number(productId),
        purchaseOrder: { tenantId },
      },
      include: {
        purchaseOrder: {
          include: { supplier: true },
        },
      },
      orderBy: { purchaseOrder: { createdAt: "desc" } },
    });

    // Group by supplierId, take most recent of each
    const supplierMap = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        lastPrice: number;
        lastDate: string;
        purchaseCount: number;
      }
    >();

    for (const item of items) {
      const sid = item.purchaseOrder.supplierId;
      const existing = supplierMap.get(sid);
      if (!existing) {
        supplierMap.set(sid, {
          supplierId: sid,
          supplierName: item.purchaseOrder.supplier?.name ?? item.purchaseOrder.supplierName,
          lastPrice: item.unitCost,
          lastDate: item.purchaseOrder.createdAt.toISOString(),
          purchaseCount: 1,
        });
      } else {
        existing.purchaseCount++;
      }
    }

    const comparaciones = Array.from(supplierMap.values());
    const minPrice = comparaciones.length > 0 ? Math.min(...comparaciones.map((c) => c.lastPrice)) : 0;

    const result = comparaciones.map((c) => ({
      ...c,
      isCheapest: c.lastPrice === minPrice,
    }));

    return NextResponse.json({ comparaciones: result });
  } catch (e) {
    console.error("[compras/precio-comparativo] GET error:", e);
    return NextResponse.json({ error: "Error obteniendo comparaciones" }, { status: 500 });
  }
}
