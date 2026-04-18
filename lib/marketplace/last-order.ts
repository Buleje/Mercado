import type { CartItem } from "@/hooks/use-marketplace-cart";

export interface MarketplaceLastOrderStore {
  storeId: string;
  storeName: string;
  storeSlug: string;
  itemsCount: number;
}

export interface MarketplaceLastOrder {
  items: CartItem[];
  total: number;
  date: string;
  customerName?: string;
  customerPhone?: string;
  stores: MarketplaceLastOrderStore[];
}

export const MARKETPLACE_LAST_ORDER_KEY = "marketplace-last-order";
export const MARKETPLACE_LAST_ORDER_EVENT = "marketplace-last-order-updated";

function isValidCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<CartItem>;
  return Boolean(
    typeof candidate.storeId === "string" &&
    typeof candidate.storeName === "string" &&
    typeof candidate.storeSlug === "string" &&
    typeof candidate.storeProductId === "string" &&
    typeof candidate.productId === "number" &&
    typeof candidate.name === "string" &&
    typeof candidate.price === "number" &&
    typeof candidate.quantity === "number"
  );
}

function isValidLastOrder(value: unknown): value is MarketplaceLastOrder {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Partial<MarketplaceLastOrder>;
  return Boolean(
    typeof candidate.total === "number" &&
    typeof candidate.date === "string" &&
    Array.isArray(candidate.items) &&
    candidate.items.every(isValidCartItem) &&
    Array.isArray(candidate.stores)
  );
}

export function readMarketplaceLastOrder(): MarketplaceLastOrder | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(MARKETPLACE_LAST_ORDER_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as unknown;
    return isValidLastOrder(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveMarketplaceLastOrder(order: MarketplaceLastOrder): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(MARKETPLACE_LAST_ORDER_KEY, JSON.stringify(order));
    window.dispatchEvent(
      new CustomEvent(MARKETPLACE_LAST_ORDER_EVENT, { detail: order }),
    );
  } catch {
    // storage unavailable — silent fail
  }
}

export function clearMarketplaceLastOrder(): void {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(MARKETPLACE_LAST_ORDER_KEY);
    window.dispatchEvent(new CustomEvent(MARKETPLACE_LAST_ORDER_EVENT));
  } catch {
    // storage unavailable — silent fail
  }
}