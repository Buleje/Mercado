// ─── Tipos locales del módulo Tenants ────────────────────────────────────────
// Los tipos globales (TenantRow, PlanId) viven en @/lib/superadmin-types

export type SortField = "name" | "plan" | "createdAt" | "ordersThisMonth";
export type SortDir = "asc" | "desc";
export type ViewMode = "table" | "cards";

export interface GrowthMonth {
  month: string;
  revenue: number;
  orders: number;
}

export interface GrowthEntry {
  slug: string;
  name: string;
  plan: string;
  createdAt: string;
  months: GrowthMonth[];
  totalRevenue: number;
  totalOrders: number;
  growthPct: number;
}
