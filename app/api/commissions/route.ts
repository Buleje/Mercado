export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";

/**
 * GET /api/commissions?from=2025-01-01&to=2025-01-31
 * Returns sales grouped by cashierId with totals, COGS, and profit for commission calculation.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  const where: Record<string, unknown> = {
    cashierId: { not: null },
  };
  if (from) where.createdAt = { ...(where.createdAt as object ?? {}), gte: new Date(from) };
  if (to) where.createdAt = { ...(where.createdAt as object ?? {}), lte: new Date(to + "T23:59:59Z") };

  const sales = await prisma.sale.findMany({
    where,
    select: { id: true, cashierId: true, total: true, totalCogs: true, payment: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  // Aggregate by cashier
  const map = new Map<string, { sales: number; revenue: number; cogs: number; profit: number }>();
  for (const s of sales) {
    const cid = s.cashierId!;
    const entry = map.get(cid) ?? { sales: 0, revenue: 0, cogs: 0, profit: 0 };
    entry.sales += 1;
    entry.revenue += s.total;
    entry.cogs += s.totalCogs ?? s.total * 0.7;
    entry.profit += s.total - (s.totalCogs ?? s.total * 0.7);
    map.set(cid, entry);
  }

  // Fetch admin user names
  const usernames = Array.from(map.keys());
  const users = await prisma.adminUser.findMany({
    where: { username: { in: usernames } },
    select: { username: true, name: true, role: true },
  });
  const nameMap = new Map(users.map(u => [u.username, { name: u.name || u.username, role: u.role }]));

  const result = Array.from(map.entries()).map(([cashierId, stats]) => ({
    cashierId,
    cashierName: nameMap.get(cashierId)?.name ?? cashierId,
    role: nameMap.get(cashierId)?.role ?? "cajero",
    ...stats,
    revenue: Math.round(stats.revenue * 100) / 100,
    cogs: Math.round(stats.cogs * 100) / 100,
    profit: Math.round(stats.profit * 100) / 100,
  })).sort((a, b) => b.revenue - a.revenue);

  return NextResponse.json(result);
}
