/**
 * Type-safe analytics tracking for Buleje
 * 
 * Integrates with:
 * - Google Analytics 4 (via gtag)
 * - Google Tag Manager
 * - Microsoft Clarity
 * - Custom analytics (future: Mixpanel, Amplitude, etc.)
 * 
 * Usage:
 * ```ts
 * import { trackEvent, trackPageView, trackConversion } from "@/lib/analytics";
 * 
 * trackEvent("add_to_cart", { productId: 123, price: 5.50 });
 * trackConversion("purchase", { orderId: 456, total: 50.00 });
 * ```
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type AnalyticsEvent =
  // E-commerce events
  | "view_item"
  | "add_to_cart"
  | "remove_from_cart"
  | "begin_checkout"
  | "purchase"
  | "view_item_list"
  | "select_item"
  // Navigation events
  | "view_home"
  | "view_shop"
  | "view_category"
  | "search"
  // Engagement events
  | "click_cta"
  | "click_whatsapp"
  | "share"
  | "newsletter_signup"
  | "exit_intent_shown"
  | "exit_intent_action"
  // User events
  | "login"
  | "signup"
  | "profile_update"
  // Error events
  | "error_occurred";

export interface EventParams {
  // E-commerce params
  currency?: string;
  value?: number;
  items?: Array<{
    item_id: string | number;
    item_name: string;
    item_category?: string;
    price?: number;
    quantity?: number;
  }>;
  transaction_id?: string | number;
  
  // General params
  category?: string;
  label?: string;
  search_term?: string;
  
  // Custom params
  source?: string;
  destination?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Generic event params
  [key: string]: any;
}

// ── Helper: Check if analytics is loaded ─────────────────────────────────────

function isAnalyticsLoaded(): boolean {
  if (typeof window === "undefined") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Browser global check
  return typeof window.gtag === "function" || typeof (window as any).dataLayer !== "undefined";
}

// ── Core tracking functions ──────────────────────────────────────────────────

/**
 * Track a custom event
 */
export function trackEvent(
  eventName: AnalyticsEvent,
  params?: EventParams
): void {
  if (!isAnalyticsLoaded()) {
    if (process.env.NODE_ENV === "development") {
      console.log("[Analytics] Event would be tracked:", eventName, params);
    }
    return;
  }

  try {
    // Google Analytics 4 (gtag)
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, params);
    }

    // Microsoft Clarity custom tags
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Clarity global is untyped
    if (typeof (window as any).clarity === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Clarity global is untyped
      (window as any).clarity("set", eventName, JSON.stringify(params || {}));
    }

    // Console log in development
    if (process.env.NODE_ENV === "development") {
      console.log(`[Analytics] ${eventName}`, params);
    }
  } catch (error) {
    console.error("[Analytics] Error tracking event:", error);
  }
}

/**
 * Track a page view
 */
export function trackPageView(url: string, title?: string): void {
  if (!isAnalyticsLoaded()) return;

  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", "page_view", {
        page_path: url,
        page_title: title || document.title,
      });
    }
  } catch (error) {
    console.error("[Analytics] Error tracking page view:", error);
  }
}

/**
 * Track a conversion (purchase, signup, etc.)
 */
export function trackConversion(
  conversionType: "purchase" | "signup" | "lead",
  data: {
    value?: number;
    currency?: string;
    transactionId?: string | number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Conversion data is dynamic
    [key: string]: any;
  }
): void {
  trackEvent(conversionType as AnalyticsEvent, {
    currency: data.currency || "PEN",
    value: data.value,
    transaction_id: data.transactionId,
    ...data,
  });

  // Also send as conversion event to Google Ads if configured
  if (typeof window.gtag === "function" && process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID) {
    window.gtag("event", "conversion", {
      send_to: process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID,
      value: data.value,
      currency: data.currency || "PEN",
      transaction_id: data.transactionId,
    });
  }
}

// ── E-commerce specific tracking ─────────────────────────────────────────────

/**
 * Track when user views a product
 */
export function trackProductView(product: {
  id: string | number;
  name: string;
  category?: string;
  price?: number;
}): void {
  trackEvent("view_item", {
    currency: "PEN",
    value: product.price,
    items: [
      {
        item_id: String(product.id),
        item_name: product.name,
        item_category: product.category,
        price: product.price,
        quantity: 1,
      },
    ],
  });
}

/**
 * Track when user adds product to cart
 */
export function trackAddToCart(product: {
  id: string | number;
  name: string;
  category?: string;
  price: number;
  quantity: number;
}): void {
  trackEvent("add_to_cart", {
    currency: "PEN",
    value: product.price * product.quantity,
    items: [
      {
        item_id: String(product.id),
        item_name: product.name,
        item_category: product.category,
        price: product.price,
        quantity: product.quantity,
      },
    ],
  });
}

/**
 * Track when user removes product from cart
 */
export function trackRemoveFromCart(product: {
  id: string | number;
  name: string;
  price: number;
  quantity: number;
}): void {
  trackEvent("remove_from_cart", {
    currency: "PEN",
    value: product.price * product.quantity,
    items: [
      {
        item_id: String(product.id),
        item_name: product.name,
        price: product.price,
        quantity: product.quantity,
      },
    ],
  });
}

/**
 * Track when user begins checkout
 */
export function trackBeginCheckout(cartItems: Array<{
  id: string | number;
  name: string;
  price: number;
  quantity: number;
}>, total: number): void {
  trackEvent("begin_checkout", {
    currency: "PEN",
    value: total,
    items: cartItems.map(item => ({
      item_id: String(item.id),
      item_name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  });
}

/**
 * Track a completed purchase
 */
export function trackPurchase(data: {
  orderId: string | number;
  total: number;
  items: Array<{
    id: string | number;
    name: string;
    price: number;
    quantity: number;
  }>;
}): void {
  trackConversion("purchase", {
    transactionId: data.orderId,
    value: data.total,
    currency: "PEN",
    items: data.items.map(item => ({
      item_id: String(item.id),
      item_name: item.name,
      price: item.price,
      quantity: item.quantity,
    })),
  });
}

// ── CTA tracking ──────────────────────────────────────────────────────────────

/**
 * Track CTA button clicks (for conversion optimization)
 */
export function trackCTAClick(data: {
  source: string;
  destination: string;
  ctaText?: string;
}): void {
  trackEvent("click_cta", {
    source: data.source,
    destination: data.destination,
    label: data.ctaText,
  });
}

/**
 * Track WhatsApp button clicks
 */
export function trackWhatsAppClick(source: string): void {
  trackEvent("click_whatsapp", {
    source,
  });
}

// ── Search tracking ───────────────────────────────────────────────────────────

/**
 * Track search queries
 */
export function trackSearch(query: string, resultsCount?: number): void {
  trackEvent("search", {
    search_term: query,
    label: resultsCount !== undefined ? `${resultsCount} resultados` : undefined,
  });
}

// ── Category tracking ─────────────────────────────────────────────────────────

/**
 * Track category views
 */
export function trackCategoryView(categoryId: string, categoryName?: string): void {
  trackEvent("view_category", {
    category: categoryId,
    label: categoryName,
  });
}

// ── Exit intent tracking ──────────────────────────────────────────────────────

/**
 * Track when exit intent modal is shown
 */
export function trackExitIntentShown(hasCartItems: boolean): void {
  trackEvent("exit_intent_shown", {
    label: hasCartItems ? "with_cart" : "without_cart",
  });
}

/**
 * Track exit intent actions
 */
export function trackExitIntentAction(action: "dismissed" | "cta_clicked" | "view_cart"): void {
  trackEvent("exit_intent_action", {
    label: action,
  });
}

// ── Type augmentation for window.gtag ────────────────────────────────────────

declare global {
  interface Window {
    gtag?: (
      command: "config" | "event" | "set",
      targetId: string,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GA4 params are untyped
      params?: Record<string, any>
    ) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GA4 dataLayer is untyped
    dataLayer?: any[];
  }
}

export {};
