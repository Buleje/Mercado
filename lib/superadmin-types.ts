// ─── SuperAdmin shared types (importable from client AND server) ─────────────

export type PlanId = "free" | "pro" | "business" | "enterprise";

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  plan: PlanId;
  trialEndsAt: string | null;
  createdAt: string;
  ownerEmail: string | null;
  customDomain: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCurrentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  _count: { AdminUser: number };
  usage?: { products: number; users: number; ordersThisMonth: number };
  limits?: { maxProducts: number; maxUsers: number; maxOrdersPerMonth: number };
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

export const DEFAULT_SETTINGS: PlatformSettings = {
  priceFree: 0,
  pricePro: 49,
  priceBusiness: 149,
  priceEnterprise: 499,
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
  pro:        { label: "Pro",        color: "bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300",          cardBg: "#0f766e", iconName: "Zap" },
  business:   { label: "Business",   color: "bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300",  cardBg: "#7c3aed", iconName: "Crown" },
  enterprise: { label: "Enterprise", color: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",      cardBg: "#d97706", iconName: "Crown" },
};
