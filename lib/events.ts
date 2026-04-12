/**
 * Type-safe custom event system for Buleje
 * 
 * Usage:
 * ```ts
 * // Dispatch
 * dispatchAppEvent("selectCategory", { categoryId: "frutas-verduras" });
 * 
 * // Listen
 * const unsubscribe = onAppEvent("selectCategory", (data) => {
 *   console.log("Category selected:", data.categoryId);
 * });
 * 
 * // Cleanup
 * unsubscribe();
 * ```
 */

// ── Event Types ───────────────────────────────────────────────────────────────

export type AppEvent = {
  /** User selected a category from nav or filters */
  selectCategory: { categoryId: string };
  
  /** User searched for a product */
  searchProduct: { query: string };
  
  /** Order was successfully created */
  orderCreated: { orderId: number; total: number; items: number };
  
  /** Announcement bar was dismissed */
  announcementDismissed: Record<string, never>;
  
  /** Announcement bar was hidden programmatically */
  announcementHidden: Record<string, never>;
  
  /** Announcement bar was shown programmatically */
  announcementShown: Record<string, never>;
  
  /** User added product to cart */
  productAdded: { productId: number; quantity: number };
  
  /** User removed product from cart */
  productRemoved: { productId: number };
  
  /** Cart was cleared */
  cartCleared: Record<string, never>;
  
  /** User viewed a product (analytics) */
  productViewed: { productId: number; productName: string };
  
  /** User clicked a CTA button (analytics) */
  ctaClicked: { source: string; destination: string };
};

export type EventName = keyof AppEvent;

// ── Dispatch ──────────────────────────────────────────────────────────────────

/**
 * Dispatch a type-safe custom event
 * @param eventName - Name of the event to dispatch
 * @param data - Event payload (type-checked based on eventName)
 */
export function dispatchAppEvent<T extends EventName>(
  eventName: T,
  data: AppEvent[T]
): void {
  const event = new CustomEvent(`buleje:${eventName}`, {
    detail: data,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
}

// ── Subscribe ─────────────────────────────────────────────────────────────────

/**
 * Subscribe to a type-safe custom event
 * @param eventName - Name of the event to listen for
 * @param handler - Callback function (type-checked based on eventName)
 * @returns Unsubscribe function
 */
export function onAppEvent<T extends EventName>(
  eventName: T,
  handler: (data: AppEvent[T]) => void
): () => void {
  const listener = ((event: CustomEvent<AppEvent[T]>) => {
    handler(event.detail);
  }) as EventListener;

  window.addEventListener(`buleje:${eventName}`, listener);

  // Return cleanup function
  return () => {
    window.removeEventListener(`buleje:${eventName}`, listener);
  };
}

// ── Helper: Once ──────────────────────────────────────────────────────────────

/**
 * Subscribe to an event and automatically unsubscribe after first trigger
 * @param eventName - Name of the event to listen for
 * @param handler - Callback function (type-checked based on eventName)
 * @returns Unsubscribe function
 */
export function onceAppEvent<T extends EventName>(
  eventName: T,
  handler: (data: AppEvent[T]) => void
): () => void {
  let unsubscribe: (() => void) | null = null;

  unsubscribe = onAppEvent(eventName, (data) => {
    handler(data);
    if (unsubscribe) unsubscribe();
  });

  return unsubscribe;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** All category IDs used in the app */
export const CATEGORY_IDS = [
  "frutas-verduras",
  "abarrotes",
  "carnes",
  "lacteos",
  "bebidas",
  "limpieza",
] as const;

export type CategoryId = (typeof CATEGORY_IDS)[number];

/** Common event sources for analytics */
export const EVENT_SOURCES = {
  HERO: "hero",
  PRODUCTS_PREVIEW: "products-preview",
  CTA_BANNER: "cta-banner",
  FOOTER: "footer",
  NAV: "nav",
  MEGA_MENU: "mega-menu",
  MOBILE_NAV: "mobile-nav",
  SEARCH: "search",
  PRODUCT_CARD: "product-card",
  CART: "cart",
} as const;
