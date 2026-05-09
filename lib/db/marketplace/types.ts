import "server-only";

// ─── Shared Types ─────────────────────────────────────────────────────────────

export type DbStore = {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  description: string | null;
  logo: string | null;
  banner: string | null;
  category: string;
  zone: string | null;
  rating: number;
  reviewCount: number;
  isPublished: boolean;
  commission: number;
  createdAt: string;
};

export interface DbStoreProductModifierOption {
  id: string;
  name: string;
  priceDelta: number;
  isDefault: boolean;
  imageUrl: string | null;
}

export interface DbStoreProductModifierGroup {
  id: string;
  name: string;
  description: string | null;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: DbStoreProductModifierOption[];
}

export type DbStoreProduct = {
  id: string;
  storeId: string;
  productId: number;
  retailPrice: number;
  wholesalePrice: number | null;
  minOrderQty: number;
  isActive: boolean;
  volumePricingTiers: unknown | null;
  productName: string;
  productImage: string | null;
  productCategory: string;
  productUnit: string;
  modifierGroups: DbStoreProductModifierGroup[];
};

export type DbVendorDashboard = {
  totalOrders: number;
  totalRevenue: number;
  totalProducts: number;
  pendingOrders: number;
  topProducts: { name: string; quantity: number; revenue: number }[];
  recentOrders: {
    id: string;
    customerName: string;
    total: number;
    status: string;
    createdAt: string;
  }[];
};

export type DbMarketplaceOrder = {
  id: string;
  storeId: string;
  storeName: string;
  storeSlug: string;
  sellerTenantId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  notes: string | null;
  total: number;
  commission: number;
  status: string;
  createdAt: string;
};

export type AbandonedCartItem = {
  storeProductId: string;
  productId: number;
  name: string;
  quantity: number;
  price: number;
  unit: string;
};

export type AbandonedCartRecord = {
  id: string;
  storeSlug: string;
  customerName: string;
  customerPhone: string;
  itemsJson: string;
  total: number;
  recovered: boolean;
  convertedAt: Date | null;
  reminderSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// ─── Shared Helpers ───────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

/**
 * Normaliza un número telefónico dejando solo dígitos.
 * Usado como dedup-key contra `Tenant.ownerPhone` (que NO es unique en schema,
 * así que la unicidad se fuerza en application-layer).
 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}
