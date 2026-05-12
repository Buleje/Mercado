// ─── Tipos locales del módulo Stores / Marketplace ───────────────────────────

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
  | "orders"
  | "coupons"
  | "analytics"
  | "personalizar"
  | "navegacion"
  | "plantilla"
  | "health"
  | "operations"
  | "categories";
