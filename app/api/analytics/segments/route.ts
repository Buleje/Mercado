import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import type { PrismaClient } from "@/lib/generated/prisma/client";

export type SegmentLabel = "vip" | "regular" | "en_riesgo" | "nuevo" | "dormido";

export type SegmentedCustomer = {
  phone: string;
  name: string;
  loyaltyTier: string;
  totalSpent: number;
  loyaltyPoints: number;
  orderCount: number;
  lastOrderDate: string | null;
  daysSinceLast: number | null;
  segment: SegmentLabel;
  createdAt: string;
};

export type SegmentsResponse = {
  customers: SegmentedCustomer[];
  counts: Record<SegmentLabel, number>;
};

const SEGMENT_LABELS: Record<SegmentLabel, string> = {
  vip: "VIP",
  regular: "Regular",
  en_riesgo: "En Riesgo",
  nuevo: "Nuevo",
  dormido: "Dormido",
};

export { SEGMENT_LABELS };

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const db = prisma as unknown as PrismaClient;
  const now = new Date();

  // Fetch all customers with their orders aggregated
  const customers = await db.customer.findMany({
    select: {
      phone: true,
      name: true,
      loyaltyTier: true,
      totalSpent: true,
      loyaltyPoints: true,
      createdAt: true,
      orders: {
        where: { status: { not: "cancelado" } },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  const result: SegmentedCustomer[] = customers.map(c => {
    const orderCount = c.orders.length;
    const lastOrder = c.orders[0] ?? null;
    const lastOrderDate = lastOrder ? lastOrder.createdAt.toISOString() : null;
    const daysSinceLast = lastOrder
      ? Math.floor((now.getTime() - lastOrder.createdAt.getTime()) / 86_400_000)
      : null;

    const daysSinceCreated = Math.floor((now.getTime() - c.createdAt.getTime()) / 86_400_000);

    // TD-018: c.totalSpent es Decimal
    const totalSpentNum = toNumOrZero(c.totalSpent);

    let segment: SegmentLabel;
    if (totalSpentNum >= 1500 || c.loyaltyTier === "diamante" || c.loyaltyTier === "oro") {
      segment = "vip";
    } else if (daysSinceCreated <= 14 && orderCount <= 1) {
      segment = "nuevo";
    } else if (daysSinceLast !== null && daysSinceLast > 60) {
      segment = "dormido";
    } else if (daysSinceLast !== null && daysSinceLast > 30) {
      segment = "en_riesgo";
    } else {
      segment = "regular";
    }

    return {
      phone: c.phone,
      name: c.name,
      loyaltyTier: c.loyaltyTier,
      // TD-018: totalSpent es Decimal — serializar a number
      totalSpent: totalSpentNum,
      loyaltyPoints: c.loyaltyPoints,
      orderCount,
      lastOrderDate,
      daysSinceLast,
      segment,
      createdAt: c.createdAt.toISOString(),
    };
  });

  // Sort: VIP first, then by totalSpent desc
  const order: SegmentLabel[] = ["vip", "regular", "nuevo", "en_riesgo", "dormido"];
  result.sort((a, b) => {
    const oi = order.indexOf(a.segment) - order.indexOf(b.segment);
    if (oi !== 0) return oi;
    return b.totalSpent - a.totalSpent;
  });

  const counts = result.reduce((acc, c) => {
    acc[c.segment] = (acc[c.segment] ?? 0) + 1;
    return acc;
  }, {} as Record<SegmentLabel, number>);

  return NextResponse.json({ customers: result, counts } satisfies SegmentsResponse);
}
