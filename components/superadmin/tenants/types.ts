// ─── Tipos locales del módulo Tenants ────────────────────────────────────────
// Los tipos globales (TenantRow, PlanId) viven en @/lib/superadmin-types

export type SortField = "name" | "plan" | "createdAt" | "ordersThisMonth";
export type SortDir = "asc" | "desc";
export type ViewMode = "table" | "cards" | "compact";

export interface GrowthMonth {
  month: string;
  revenue: number;
  orders: number;
  /** Pedidos + ventas POS + libro CTP + trozas del mes. */
  operaciones: number;
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
  /** Un aserradero no tiene pedidos: se mide por operaciones. */
  perfil: "tienda" | "aserradero";
  totalOperaciones: number;
  operacionesPct: number;
}
