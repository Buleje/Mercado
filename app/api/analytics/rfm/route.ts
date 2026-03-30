export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const querySchema = z.object({
  days: z.coerce.number().min(7).max(365).default(90),
});

type RFMCustomer = {
  phone: string;
  name: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  rScore: number;
  fScore: number;
  mScore: number;
  segment: string;
};

type RFMSegment = {
  segment: string;
  count: number;
  avgMonetary: number;
  avgFrequency: number;
  color: string;
  action: string;
};

const SEGMENT_CONFIG: Record<string, { color: string; action: string }> = {
  Champions: { color: "#0f766e", action: "Recompensar lealtad, ofrecer exclusividades" },
  Loyal: { color: "#0d9488", action: "Upselling, programa de referidos" },
  New: { color: "#74c0fc", action: "Onboarding, primera experiencia memorable" },
  AtRisk: { color: "#f97316", action: "Campaña de reactivación urgente" },
  Lost: { color: "#e76f51", action: "Descuento agresivo o descarte" },
  Regular: { color: "#adb5bd", action: "Incentivar frecuencia con promociones" },
};

/**
 * GET /api/analytics/rfm?days=90
 * RFM analysis using PERCENTILE-based tercile scoring (1-3).
 * Uses both Sale.customerPhone and Order.customerPhone to find customers.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({ days: searchParams.get("days") ?? 90 });
    const days = parsed.success ? parsed.data.days : 90;

    const now = new Date();
    const cutoffDate = new Date(now);
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const tenantFilter = { tenantId: auth.tenantId };

    // Fetch sales and non-cancelled orders with customerPhone
    const [sales, orders] = await Promise.allSettled([
      prisma.sale.findMany({
        where: { ...tenantFilter, createdAt: { gte: cutoffDate }, customerPhone: { not: null } },
        select: { customerPhone: true, total: true, createdAt: true },
      }),
      prisma.order.findMany({
        where: {
          ...tenantFilter,
          createdAt: { gte: cutoffDate },
          customerPhone: { not: null },
          status: { not: "cancelado" },
        },
        select: { customerPhone: true, total: true, createdAt: true },
      }),
    ]);

    const salesData = sales.status === "fulfilled" ? sales.value : [];
    const ordersData = orders.status === "fulfilled" ? orders.value : [];

    if (salesData.length === 0 && ordersData.length === 0) {
      return NextResponse.json({
        customers: [],
        segments: [],
        total: 0,
        message: "No hay ventas con cliente identificado en el período seleccionado",
      });
    }

    // Aggregate by customerPhone
    type CustomerData = { lastPurchase: Date; frequency: number; monetary: number };
    const customerMap = new Map<string, CustomerData>();

    for (const sale of salesData) {
      if (!sale.customerPhone) continue;
      const existing = customerMap.get(sale.customerPhone) ?? {
        lastPurchase: new Date(0),
        frequency: 0,
        monetary: 0,
      };
      existing.frequency++;
      existing.monetary += sale.total;
      if (sale.createdAt > existing.lastPurchase) {
        existing.lastPurchase = sale.createdAt;
      }
      customerMap.set(sale.customerPhone, existing);
    }

    for (const order of ordersData) {
      if (!order.customerPhone) continue;
      const existing = customerMap.get(order.customerPhone) ?? {
        lastPurchase: new Date(0),
        frequency: 0,
        monetary: 0,
      };
      existing.frequency++;
      existing.monetary += order.total;
      if (order.createdAt > existing.lastPurchase) {
        existing.lastPurchase = order.createdAt;
      }
      customerMap.set(order.customerPhone, existing);
    }

    if (customerMap.size === 0) {
      return NextResponse.json({
        customers: [],
        segments: [],
        total: 0,
        message: "No hay clientes identificados con compras en el período",
      });
    }

    // Load customer names
    const phones = Array.from(customerMap.keys());
    const customers = await prisma.customer.findMany({
      where: { phone: { in: phones }, ...tenantFilter },
      select: { phone: true, name: true },
    });
    const nameMap = new Map(customers.map((c) => [c.phone, c.name]));

    // Build raw RFM data
    type RawRFM = { phone: string; recencyDays: number; frequency: number; monetary: number };
    const rawData: RawRFM[] = Array.from(customerMap.entries()).map(([phone, data]) => ({
      phone,
      recencyDays: Math.floor((now.getTime() - data.lastPurchase.getTime()) / (1000 * 60 * 60 * 24)),
      frequency: data.frequency,
      monetary: Math.round(data.monetary * 100) / 100,
    }));

    // Percentile-based tercile scoring (1-3)
    function getPercentileValue(sortedValues: number[], percentile: number): number {
      const index = Math.floor((percentile / 100) * (sortedValues.length - 1));
      return sortedValues[index];
    }

    // Recency: lower is better → score 3 for low recency
    const recencyValues = rawData.map((d) => d.recencyDays).sort((a, b) => a - b);
    const rP33 = getPercentileValue(recencyValues, 33);
    const rP66 = getPercentileValue(recencyValues, 66);

    // Frequency: higher is better
    const freqValues = rawData.map((d) => d.frequency).sort((a, b) => a - b);
    const fP33 = getPercentileValue(freqValues, 33);
    const fP66 = getPercentileValue(freqValues, 66);

    // Monetary: higher is better
    const monValues = rawData.map((d) => d.monetary).sort((a, b) => a - b);
    const mP33 = getPercentileValue(monValues, 33);
    const mP66 = getPercentileValue(monValues, 66);

    function scoreRecency(val: number): number {
      // Lower recency = better = higher score
      if (val <= rP33) return 3;
      if (val <= rP66) return 2;
      return 1;
    }

    function scoreFrequency(val: number): number {
      if (val >= fP66) return 3;
      if (val >= fP33) return 2;
      return 1;
    }

    function scoreMonetary(val: number): number {
      if (val >= mP66) return 3;
      if (val >= mP33) return 2;
      return 1;
    }

    // Segment classification
    function getSegment(r: number, f: number): string {
      if (r === 3 && f === 3) return "Champions";
      if (f === 3) return "Loyal";
      if (r === 3 && f === 1) return "New";
      if (r === 1 && f >= 2) return "AtRisk";
      if (r === 1 && f === 1) return "Lost";
      return "Regular";
    }

    const rfmCustomers: RFMCustomer[] = rawData.map((d) => {
      const rScore = scoreRecency(d.recencyDays);
      const fScore = scoreFrequency(d.frequency);
      const mScore = scoreMonetary(d.monetary);
      return {
        phone: d.phone,
        name: nameMap.get(d.phone) ?? d.phone,
        recencyDays: d.recencyDays,
        frequency: d.frequency,
        monetary: d.monetary,
        rScore,
        fScore,
        mScore,
        segment: getSegment(rScore, fScore),
      };
    });

    // Aggregate segments
    const segmentMap = new Map<string, { count: number; totalMonetary: number; totalFrequency: number }>();
    for (const c of rfmCustomers) {
      const existing = segmentMap.get(c.segment) ?? { count: 0, totalMonetary: 0, totalFrequency: 0 };
      existing.count++;
      existing.totalMonetary += c.monetary;
      existing.totalFrequency += c.frequency;
      segmentMap.set(c.segment, existing);
    }

    const segments: RFMSegment[] = Array.from(segmentMap.entries())
      .map(([segment, data]) => ({
        segment,
        count: data.count,
        avgMonetary: Math.round((data.totalMonetary / data.count) * 100) / 100,
        avgFrequency: Math.round((data.totalFrequency / data.count) * 10) / 10,
        color: SEGMENT_CONFIG[segment]?.color ?? "#adb5bd",
        action: SEGMENT_CONFIG[segment]?.action ?? "Monitorear",
      }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      customers: rfmCustomers,
      segments,
      total: rfmCustomers.length,
    });
  } catch (e) {
    console.error("[analytics/rfm] GET error:", e);
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
