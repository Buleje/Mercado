import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { toNumOrZero } from "@/lib/decimal-utils";

/**
 * GET /api/commissions?from=2025-01-01&to=2025-01-31
 * Returns sales grouped by cashierId with totals, COGS, and profit for commission calculation.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");

  // SECURITY 2026-05-07 (X3): tenantId en ambas queries para aislamiento multi-tenant.
  // Sin tenantId, el endpoint devolvía ventas y usuarios de TODOS los tenants.
  // eslint-disable-next-line no-restricted-properties
  // NOTE: aggregation legacy — refactor a CommissionsDB pendiente (ADR-TODO).
  const where: Record<string, unknown> = {
    tenantId: auth.tenantId,
    cashierId: { not: null },
  };
  if (from) where.createdAt = { ...(where.createdAt as object ?? {}), gte: new Date(from) };
  if (to) where.createdAt = { ...(where.createdAt as object ?? {}), lte: new Date(to + "T23:59:59Z") };

  // eslint-disable-next-line no-restricted-properties
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
    const totalNum = toNumOrZero(s.total);
    const cogsNum = s.totalCogs != null ? toNumOrZero(s.totalCogs) : totalNum * 0.7;
    entry.sales += 1;
    entry.revenue += totalNum;
    entry.cogs += cogsNum;
    entry.profit += totalNum - cogsNum;
    map.set(cid, entry);
  }

  // Fetch admin user names — scoped a tenant para no exponer usuarios de otros tenants
  const usernames = Array.from(map.keys());
  // eslint-disable-next-line no-restricted-properties
  const users = await prisma.adminUser.findMany({
    where: { username: { in: usernames }, tenantId: auth.tenantId },
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
