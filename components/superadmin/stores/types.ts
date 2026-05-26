// ─── Tipos locales del módulo Stores / Marketplace ───────────────────────────

export type StoreBenefitKey =
  | "verified"
  | "searchBoost"
  | "featuredHome"
  | "ownBanner"
  | "reducedCommission"
  | "featuredProducts"
  | "prioritySupport"
  | "advancedAnalytics";

export interface StoreRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo: string | null;
  banner: string | null;
  isPublished: boolean;
  rating: number;
  reviewCount: number;
  category: string;
  zone: string;
  commission: number;
  createdAt: string;
  /** Nivel de beneficio/visibilidad en /tiendas. Default "standard". */
  displayTier?: "standard" | "featured" | "premium";
  /** Beneficios por tienda (superadmin). Claves booleanas, default {}. */
  benefits?: Partial<Record<StoreBenefitKey, boolean>>;
  tenant: {
    id: string;
    slug: string;
    name: string;
    plan: string;
    active: boolean;
  };
  _count: { products: number };
}

export interface MarketplaceOrder {
  id: string;
  storeName: string;
  storeSlug: string;
  tenantPlan?: string;
  customerName: string;
  customerPhone: string;
  customerLocation?: string;
  total: number;
  status: string;
  paymentMethod?: string;
  itemCount: number;
  createdAt: string;
}

export interface MarketplaceCoupon {
  id: string;
  code: string;
  storeName: string;
  discountType: string;
  discountValue: number;
  maxUses: number;
  usedCount: number;
  active: boolean;
  expiresAt: string | null;
}

export type StoreTab =
  | "stores"
  | "beneficios"
  | "orders"
  | "coupons"
  | "analytics"
  | "personalizar"
  | "navegacion"
  | "plantilla"
  | "health"
  | "operations"
  | "categories";
