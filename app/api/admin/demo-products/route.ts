export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

// IDs of the 24 products auto-seeded from data/products.ts when the DB was empty
const DEMO_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24];

export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    // Remove FK-dependent records first (same order as full clear-data)
    await prisma.bundleItem.deleteMany({ where: { productId: { in: DEMO_IDS } } });
    await prisma.priceHistory.deleteMany({ where: { productId: { in: DEMO_IDS } } });
    await prisma.inventoryMovement.deleteMany({ where: { productId: { in: DEMO_IDS } } });
    await prisma.saleItem.deleteMany({ where: { productId: { in: DEMO_IDS } } });
    await prisma.purchaseItem.deleteMany({ where: { productId: { in: DEMO_IDS } } });
    await prisma.orderItem.deleteMany({ where: { productId: { in: DEMO_IDS } } });
    const { count } = await prisma.product.deleteMany({ where: { id: { in: DEMO_IDS } } });
    return NextResponse.json({ ok: true, deleted: count });
  } catch (e) {
    console.error("[demo-products] DELETE error:", e);
    return NextResponse.json({ error: "Error al eliminar productos de ejemplo" }, { status: 500 });
  }
}
