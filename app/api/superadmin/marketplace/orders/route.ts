import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";

// GET /api/superadmin/marketplace/orders
// Returns all marketplace orders across all tenants
export async function GET(req: NextRequest) {
  const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const session = await getPlatformSession(token);
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: {
      source: "marketplace",
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: {
      id: true,
      tenantId: true,
      customerName: true,
      customerPhone: true,
      total: true,
      status: true,
      createdAt: true,
      items: {
        select: { id: true },
      },
    },
  });

  const mapped = orders.map((o) => ({
    id: o.id,
    storeName: "—",
    storeSlug: "",
    customerName: o.customerName ?? "Anónimo",
    customerPhone: o.customerPhone ?? "",
    total: o.total,
    status: o.status,
    itemCount: o.items.length,
    createdAt: o.createdAt.toISOString(),
  }));

  return NextResponse.json({ orders: mapped });
}
