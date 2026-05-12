// ─── SuperAdmin shared types (importable from client AND server) ─────────────

export type PlanId = "free" | "pro" | "business" | "enterprise";

export interface TenantStoreInfo {
  id: string;
  slug: string;
  name: string;
  isPublished: boolean;
  rating: number;
  reviewCount: number;
  category: string;
  zone: string | null;
  commission: number;
  _count: { products: number };
}

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  plan: PlanId;
  trialEndsAt: string | null;
  createdAt: string;
  ownerEmail: string | null;
  ownerPhone: string | null;
  customDomain: string | null;
  /** Logo del tenant — prioriza Settings.logoUrl (configurado por el admin), fallback a Tenant.logoUrl. */
  logoUrl: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  _count: { AdminUser: number };
  usage?: { products: number; users: number; ordersThisMonth: number };
  limits?: { maxProducts: number; maxUsers: number; maxOrdersPerMonth: number };
  stores?: TenantStoreInfo[];
  monthRevenue?: number;
  monthOrders?: number;
  monthExpenses?: number;
  monthProfit?: number;
  /** Pedidos no entregados ni cancelados (pendiente/preparando/asignado/en_camino). */
  pendingOrders?: number;
}

export interface CommissionRow {
  id: string;
  orderId: string;
  storeId: string | null;
  partnerId: string | null;
  type: string;
  amount: number;
  rate: number;
  status: string;
  settledAt: string | null;
  createdAt: string;
}

export interface PlatformSettings {
  priceFree: number;
  pricePro: number;
  priceBusiness: number;
  priceEnterprise: number;
  commissionDefault: number;
  limitsFreeProducts: number;
  limitsFreeUsers: number;
  limitsFreeOrders: number;
  limitsProProducts: number;
  limitsProUsers: number;
  limitsProOrders: number;
  allowNewStores: boolean;
  maintenanceMode: boolean;
}

/**
 * DEFAULT_SETTINGS — fallback UI defaults para el formulario de superadmin.
 *
 * ⚠️ NO uses estos valores para cálculos server-side (MRR, billing, Stripe).
 *     Para leer el precio canónico usa `getAllPlanPrices()` / `getPlanPrice(plan)`
 *     de `lib/plans.ts`, que lee desde `PlatformSetting("plan-prices")` en DB.
 *
 * Fix del bug MRR fake 2026-04-09 — ver docs/research/superadmin-improvements-2026-04-09.md
 */
export const DEFAULT_SETTINGS: PlatformSettings = {
  // Brandon mayo 2026 v2 — precios alineados con plan-tiers.ts:
  //   priceFree=Free (S/0) · pricePro=Starter (S/89) · priceBusiness=Pro (S/179) · priceEnterprise=Business (S/349)
  priceFree: 0,
  pricePro: 89,
  priceBusiness: 179,
  priceEnterprise: 349,
  commissionDefault: 2.5,
  limitsFreeProducts: 50,
  limitsFreeUsers: 2,
  limitsFreeOrders: 100,
  limitsProProducts: 500,
  limitsProUsers: 10,
  limitsProOrders: 1000,
  allowNewStores: true,
  maintenanceMode: false,
};

// ─── Plan config (sin JSX — solo strings) ─────────────────────────────────────

export const PLAN_LABELS: Record<
  PlanId,
  { label: string; color: string; cardBg: string; iconName: string }
> = {
  free:       { label: "Free",       color: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",          cardBg: "#6b7280", iconName: "ShoppingBag" },
  pro:        { label: "Pro",        color: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",          cardBg: "#00B4A6", iconName: "Zap" },
  business:   { label: "Business",   color: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",  cardBg: "#7c3aed", iconName: "Crown" },
  enterprise: { label: "Enterprise", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",      cardBg: "#d97706", iconName: "Crown" },
};
