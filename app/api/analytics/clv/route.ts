import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { AnalyticsCLVDB } from "@/lib/db/analytics-clv.db";
import { toNumOrZero } from "@/lib/decimal-utils";

export type CLVCustomer = {
  phone: string;
  name: string;
  cohortMonth: string;        // "2024-01"
  firstOrderDate: string;
  lastOrderDate: string;
  orderCount: number;
  totalSpent: number;
  avgOrderValue: number;
  daysSinceFirst: number;
  daysSinceLast: number;
};

export type CLVCohort = {
  month: string;              // "2024-01"
  customers: number;
  totalRevenue: number;
  avgLTV: number;
  avgOrders: number;
};

export type CLVResponse = {
  customers: CLVCustomer[];
  cohorts: CLVCohort[];
  summary: {
    totalCustomers: number;
    avgLTV: number;
    avgOrderCount: number;
    avgDaysBetweenOrders: number;
  };
};

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;

  // SECURITY 2026-05-12 (audit data-finops P0): TODAS las queries deben
  // scopear por tenantId. Antes el groupBy mezclaba órdenes de TODOS los
  // tenants → data leak cross-tenant en CLV de SaaS multi-tenant.
  const tenantId = auth.tenantId;

  // Aggregate orders by customerPhone (non-cancelled) — scope por tenantId
  const rows = await AnalyticsCLVDB.getOrderAggregatesByPhone(tenantId);

  if (!rows.length) {
    return NextResponse.json({ customers: [], cohorts: [], summary: { totalCustomers: 0, avgLTV: 0, avgOrderCount: 0, avgDaysBetweenOrders: 0 } } satisfies CLVResponse);
  }

  const phones = rows.map(r => r.customerPhone);

  // Get first + last order dates per customer + customer names — todos con tenantId scope
  const [{ firstOrders, lastOrders }, customers] = await Promise.all([
    AnalyticsCLVDB.getOrderDateRangesByPhone(tenantId, phones),
    AnalyticsCLVDB.getCustomerNamesByPhone(tenantId, phones),
  ]);

  const firstMap = new Map(firstOrders.map(r => [r.customerPhone, r.minDate as Date]));
  const lastMap  = new Map(lastOrders.map(r  => [r.customerPhone, r.maxDate as Date]));
  const nameMap  = new Map(customers.map(c => [c.phone, c.name]));

  const now = new Date();

  const clvCustomers: CLVCustomer[] = rows
    .filter(r => firstMap.has(r.customerPhone))
    .map(r => {
      const phone = r.customerPhone;
      const first = firstMap.get(phone)!;
      const last  = lastMap.get(phone)!;
      const daysSinceFirst = Math.floor((now.getTime() - first.getTime()) / 86400000);
      const daysSinceLast  = Math.floor((now.getTime() - last.getTime())  / 86400000);
      const orderCount = r.orderCount;
      // TD-018: r.totalSpent puede ser null
      const totalSpent = toNumOrZero(r.totalSpent);
      return {
        phone,
        name: nameMap.get(phone) ?? phone,
        cohortMonth: `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}`,
        firstOrderDate: first.toISOString(),
        lastOrderDate:  last.toISOString(),
        orderCount,
        totalSpent: Math.round(totalSpent * 100) / 100,
        avgOrderValue: orderCount > 0 ? Math.round((totalSpent / orderCount) * 100) / 100 : 0,
        daysSinceFirst,
        daysSinceLast,
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent);

  // Build cohort aggregates
  const cohortMap = new Map<string, { customers: number; totalRevenue: number; totalOrders: number }>();
  for (const c of clvCustomers) {
    const existing = cohortMap.get(c.cohortMonth) ?? { customers: 0, totalRevenue: 0, totalOrders: 0 };
    existing.customers++;
    existing.totalRevenue += c.totalSpent;
    existing.totalOrders  += c.orderCount;
    cohortMap.set(c.cohortMonth, existing);
  }

  const cohorts: CLVCohort[] = Array.from(cohortMap.entries())
    .map(([month, d]) => ({
      month,
      customers: d.customers,
      totalRevenue: Math.round(d.totalRevenue * 100) / 100,
      avgLTV: d.customers > 0 ? Math.round((d.totalRevenue / d.customers) * 100) / 100 : 0,
      avgOrders: d.customers > 0 ? Math.round((d.totalOrders / d.customers) * 10) / 10 : 0,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const totalLTV   = clvCustomers.reduce((s, c) => s + c.totalSpent, 0);
  const totalOrders = clvCustomers.reduce((s, c) => s + c.orderCount, 0);
  const n = clvCustomers.length;

  return NextResponse.json({
    customers: clvCustomers,
    cohorts,
    summary: {
      totalCustomers: n,
      avgLTV:         n > 0 ? Math.round((totalLTV / n) * 100) / 100 : 0,
      avgOrderCount:  n > 0 ? Math.round((totalOrders / n) * 10) / 10 : 0,
      avgDaysBetweenOrders: 0,
    },
  } satisfies CLVResponse);
}
