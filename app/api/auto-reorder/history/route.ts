export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { tenantId } = auth;
    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200);

    // Fetch recent purchase orders as reorder history
    const orders = await prisma.purchaseOrder.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        items: {
          include: { product: { select: { id: true, name: true, unit: true } } },
        },
        supplier: { select: { id: true, name: true } },
      },
    });

    const history = orders.map(o => ({
      id: o.id,
      date: o.createdAt,
      status: o.status,
      supplier: o.supplier?.name ?? "Sin proveedor",
      total: o.total,
      itemCount: o.items.length,
      items: o.items.map(i => ({
        productId: i.productId,
        productName: i.product?.name ?? "—",
        unit: i.product?.unit ?? "",
        quantity: i.quantity,
        unitCost: i.unitCost,
      })),
    }));

    return NextResponse.json({ history, total: history.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[auto-reorder/history] GET error", msg);
    return NextResponse.json({ history: [], total: 0, error: msg }, { status: 200 });
  }
}
