import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getPlatformSession, PLATFORM_SESSION } from "@/lib/superadmin-session";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// GET /api/superadmin/marketplace/orders
// Returns all marketplace orders with rich fields for analytics.
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get(PLATFORM_SESSION.COOKIE_NAME)?.value;
    if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const session = await getPlatformSession(token);
    if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const [orders, tenants] = await Promise.all([
      prisma.order.findMany({
        where: {
          source: "marketplace",
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
        take: 2000,
        select: {
          id: true,
          tenantId: true,
          customerName: true,
          customerPhone: true,
          customerLocation: true,
          total: true,
          status: true,
          paymentMethod: true,
          createdAt: true,
          items: { select: { id: true } },
        },
      }),
      prisma.tenant.findMany({
        select: { id: true, name: true, slug: true, plan: true },
      }),
    ]);

    const tenantById = new Map(tenants.map((t) => [t.id, t]));

    const mapped = orders.map((o) => {
      const tn = tenantById.get(o.tenantId);
      return {
        id: o.id,
        storeName: tn?.name ?? "—",
        storeSlug: tn?.slug ?? "",
        tenantPlan: tn?.plan ?? "free",
        customerName: o.customerName ?? "Anónimo",
        customerPhone: o.customerPhone ?? "",
        customerLocation: o.customerLocation ?? "",
        total:
          typeof o.total === "object" && o.total !== null && "toNumber" in o.total
            ? (o.total as { toNumber(): number }).toNumber()
            : Number(o.total) || 0,
        status: o.status,
        paymentMethod: o.paymentMethod ?? "",
        itemCount: o.items.length,
        createdAt: o.createdAt.toISOString(),
      };
    });

    return NextResponse.json({ orders: mapped });

  } catch (e) {
    logger.error("[get] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
