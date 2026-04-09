import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(req, ["admin", "almacenero"]);
  if (auth instanceof NextResponse) return auth;

  const tenantId = auth.tenantId ?? "main";
  const { id } = await params;

  try {
    // 1. Fetch all purchase orders for this supplier
    const orders = await prisma.purchaseOrder.findMany({
      where: { tenantId, supplierId: id },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });

    const totalOC = orders.length;

    if (totalOC < 3) {
      return NextResponse.json({
        score: null,
        grade: null,
        metrics: null,
        totalOC,
        lastDelivery: orders[0]?.updatedAt?.toISOString() ?? null,
        insufficient: true,
      });
    }

    // 2. Calculate metrics

    // Completion rate: % of OC with status "recibido" vs total
    const completedCount = orders.filter((o) => o.status === "recibido").length;
    const completionRate = (completedCount / totalOC) * 100;

    // Average delivery days: days between createdAt and updatedAt
    const deliveryDays = orders
      .filter((o) => o.status === "recibido" || o.status === "parcial")
      .map((o) => {
        const created = new Date(o.createdAt).getTime();
        const updated = new Date(o.updatedAt).getTime();
        return Math.max(0, (updated - created) / (1000 * 60 * 60 * 24));
      });

    const avgDeliveryDays =
      deliveryDays.length > 0
        ? Math.round((deliveryDays.reduce((s, d) => s + d, 0) / deliveryDays.length) * 10) / 10
        : 0;

    // On-time delivery: we consider "on time" if delivered within 7 days
    const onTimeCount = deliveryDays.filter((d) => d <= 7).length;
    const onTimeDelivery =
      deliveryDays.length > 0 ? (onTimeCount / deliveryDays.length) * 100 : 100;

    // Price consistency: coefficient of variation of unit prices across all items
    // TD-018: i.unitCost es Decimal → convertir al aplanar
    const allPrices = orders.flatMap((o) => o.items.map((i) => toNumOrZero(i.unitCost)));
    let priceVariance = 100; // default: perfectly consistent
    if (allPrices.length > 1) {
      const mean = allPrices.reduce((s, p) => s + p, 0) / allPrices.length;
      if (mean > 0) {
        const variance =
          allPrices.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / allPrices.length;
        const cv = (Math.sqrt(variance) / mean) * 100; // coefficient of variation
        priceVariance = Math.max(0, 100 - cv); // lower cv = more consistent = higher score
      }
    }

    // Speed score: inverse of delivery days, max 100
    const speedScore = avgDeliveryDays <= 1 ? 100 : Math.max(0, 100 - (avgDeliveryDays - 1) * 10);

    // 3. Weighted score
    const score = Math.round(
      onTimeDelivery * 0.3 +
        completionRate * 0.3 +
        priceVariance * 0.2 +
        speedScore * 0.2,
    );

    // 4. Grade
    const grade = score > 85 ? "A" : score > 70 ? "B" : score > 55 ? "C" : "D";

    return NextResponse.json({
      score,
      grade,
      metrics: {
        onTimeDelivery: Math.round(onTimeDelivery),
        avgDeliveryDays,
        completionRate: Math.round(completionRate),
        priceVariance: Math.round(priceVariance),
        speedScore: Math.round(speedScore),
      },
      totalOC,
      lastDelivery: orders[0]?.updatedAt?.toISOString() ?? null,
      insufficient: false,
    });
  } catch (e) {
    console.error("[proveedores/scorecard] GET error:", e);
    return NextResponse.json({ error: "Error calculando scorecard" }, { status: 500 });
  }
}
