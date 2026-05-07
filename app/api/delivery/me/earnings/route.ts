import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";

/**
 * GET /api/delivery/me/earnings?period=today|week|month|all
 *
 * Devuelve ganancias del partner autenticado:
 *   - delivered: fees de assignments delivered en el periodo
 *   - tips: suma de tipAmount
 *   - byDay: array para gráfico (últimos N días)
 */
export async function GET(req: NextRequest) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period") ?? "month";

  const now = new Date();
  const since = new Date(now);
  let bucketDays = 30;
  if (period === "today") { since.setHours(0, 0, 0, 0); bucketDays = 1; }
  else if (period === "week") { since.setDate(now.getDate() - 7); bucketDays = 7; }
  else if (period === "month") { since.setDate(now.getDate() - 30); bucketDays = 30; }
  else { since.setFullYear(now.getFullYear() - 5); bucketDays = 90; }

  // SECURITY 2026-05-05 (pentest delivery H012): scope tenantId. Antes
  // un assignment con tenantId divergente (ver H010 ya parchado) inflaba
  // earnings cruzadas del partner.
  const assignments = await prisma.deliveryAssignment.findMany({
    where: {
      partnerId: session.partnerId,
      tenantId: session.tenantId,
      status: "delivered",
      deliveredAt: { gte: since },
    },
    select: {
      id: true, fee: true, tipAmount: true, deliveredAt: true,
    },
    orderBy: { deliveredAt: "asc" },
  });

  const totalFees = assignments.reduce((s, a) => s + Number(a.fee), 0);
  const totalTips = assignments.reduce((s, a) => s + Number(a.tipAmount ?? 0), 0);

  // Bucket por día.
  const byDay: { date: string; fees: number; tips: number; count: number }[] = [];
  const map = new Map<string, { fees: number; tips: number; count: number }>();
  for (const a of assignments) {
    if (!a.deliveredAt) continue;
    const key = a.deliveredAt.toISOString().slice(0, 10);
    const existing = map.get(key) ?? { fees: 0, tips: 0, count: 0 };
    existing.fees += Number(a.fee);
    existing.tips += Number(a.tipAmount ?? 0);
    existing.count += 1;
    map.set(key, existing);
  }
  // Llenar ventana con ceros para que el chart no salte.
  for (let i = bucketDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const e = map.get(key) ?? { fees: 0, tips: 0, count: 0 };
    byDay.push({ date: key, ...e });
  }

  return NextResponse.json({
    period,
    since: since.toISOString(),
    totals: {
      deliveries: assignments.length,
      fees: totalFees,
      tips: totalTips,
      total: totalFees + totalTips,
    },
    byDay,
  });
}
