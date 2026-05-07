import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
import { getOrSet } from "@/lib/cache";

/**
 * GET /api/customers/rfm — Returns RFM segmentation for all customers.
 *
 * R = Recency   (days since last order)  → lower is better → higher score
 * F = Frequency (number of orders)       → higher is better
 * M = Monetary  (total spent)            → higher is better
 *
 * Each dimension scored 1-5 (quintiles).
 * Segments: VIP, Leal, Prometedor, Nuevo, En riesgo, Dormido, Perdido
 */

export type RFMCustomer = {
  phone: string;
  name: string;
  recencyDays: number;
  frequency: number;
  monetary: number;
  rScore: number;
  fScore: number;
  mScore: number;
  segment: string;
  segmentColor: string;
};

function quintile(values: number[], value: number): number {
  if (values.length === 0) return 3;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = sorted.findIndex((v) => v >= value);
  const pos = idx === -1 ? sorted.length : idx;
  return Math.min(5, Math.max(1, Math.ceil(((pos + 1) / sorted.length) * 5)));
}

function assignSegment(r: number, f: number, m: number): { segment: string; color: string } {
  const avg = (f + m) / 2;
  if (r >= 4 && avg >= 4) return { segment: "VIP", color: "#7c3aed" };
  if (r >= 3 && f >= 3) return { segment: "Leal", color: "#2563eb" };
  if (r >= 4 && avg < 3) return { segment: "Nuevo", color: "#06b6d4" };
  if (r >= 3 && avg >= 2) return { segment: "Prometedor", color: "#16a34a" };
  if (r <= 2 && avg >= 3) return { segment: "En riesgo", color: "#f59e0b" };
  if (r <= 2 && avg < 3) return { segment: "Dormido", color: "#9ca3af" };
  return { segment: "Perdido", color: "#dc2626" };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const now = new Date();
    const cacheKey = `customers:rfm:${auth.tenantId}`;

    // eslint-disable-next-line no-restricted-properties -- analytics RFM tenant-scoped.
    const orders = await getOrSet(cacheKey, 300, () =>
      prisma.order.findMany({
        where: { customerPhone: { not: null }, tenantId: auth.tenantId },
        select: { customerPhone: true, customerName: true, total: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      })
    );

    // Aggregate per customer
    const map = new Map<string, { name: string; lastOrder: Date; count: number; spent: number }>();
    for (const o of orders) {
      if (!o.customerPhone) continue;
      const totalNum = toNumOrZero(o.total);
      const existing = map.get(o.customerPhone);
      if (existing) {
        existing.count += 1;
        existing.spent += totalNum;
        if (o.createdAt > existing.lastOrder) existing.lastOrder = o.createdAt;
      } else {
        map.set(o.customerPhone, {
          name: o.customerName,
          lastOrder: o.createdAt,
          count: 1,
          spent: totalNum,
        });
      }
    }

    if (map.size === 0) {
      return NextResponse.json([]);
    }

    // Compute raw values
    const entries = Array.from(map.entries()).map(([phone, d]) => ({
      phone,
      name: d.name,
      recencyDays: Math.floor((now.getTime() - d.lastOrder.getTime()) / 86400000),
      frequency: d.count,
      monetary: d.spent,
    }));

    const recencies = entries.map((e) => e.recencyDays);
    const frequencies = entries.map((e) => e.frequency);
    const monetaries = entries.map((e) => e.monetary);

    // Score — for recency, LOWER days = BETTER, so we invert the quintile
    const result: RFMCustomer[] = entries.map((e) => {
      const rScore = 6 - quintile(recencies, e.recencyDays); // invert: low recency → high score
      const fScore = quintile(frequencies, e.frequency);
      const mScore = quintile(monetaries, e.monetary);
      const { segment, color } = assignSegment(rScore, fScore, mScore);
      return {
        phone: e.phone,
        name: e.name,
        recencyDays: e.recencyDays,
        frequency: e.frequency,
        monetary: Math.round(e.monetary * 100) / 100,
        rScore,
        fScore,
        mScore,
        segment,
        segmentColor: color,
      };
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch (e) {
    logger.error("[rfm] error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "RFM calculation failed" }, { status: 500 });
  }
}
