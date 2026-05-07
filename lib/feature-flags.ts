/**
 * lib/feature-flags.ts
 *
 * Lightweight feature flag system for trunk-based development.
 * Flags can come from: env vars, database (Settings), or hardcoded defaults.
 *
 * Usage:
 *   import { isFeatureEnabled } from "@/lib/feature-flags";
 *   if (await isFeatureEnabled("bullmq-queues", tenantId)) { ... }
 */

import { logger } from "@/lib/logger";

export type FeatureFlag =
  | "bullmq-queues"                // Use BullMQ instead of fire-and-forget
  | "refresh-tokens"               // Use access+refresh token rotation
  | "rolling-releases"             // Canary deployments on Vercel
  | "redis-cache"                  // Use Redis-backed cache
  | "oauth-google"                 // Google OAuth login for customers
  | "oauth-facebook"               // Facebook OAuth login for customers
  | "cursor-pagination"            // Cursor-based pagination
  | "ai-assistant-v2"              // Next-gen AI assistant
  | "marketplace-v2"               // Enhanced marketplace features
  | "whatsapp-bot"                 // WhatsApp chatbot integration
  | "push-notifications"           // Web push notifications
  | "whatsapp-order-notifications" // WhatsApp al dueño cuando llega una nueva orden
  | "auto-coupon-triggers"         // Cupones automáticos por hito (primera compra, cumpleaños, 10ma compra)
  | "delivery-live"                // Bloque D1: tracking vivo + rutas + endpoint público
  | "delivery-live-whatsapp"       // Worker BullMQ que dispara WhatsApp al cliente en eventos nearby/delivered
  | "delivery-live-public-link"    // Endpoint público /api/track/[orderId] para el cliente final
  | "marketplace-chat"             // Bloque D2: chat buyer ↔ seller admin UI
  | "marketplace-chat-public"      // Endpoints públicos del buyer /api/chat/public
  | "marketplace-chat-whatsapp"    // Worker BullMQ que dispara WhatsApp en eventos del chat
  | "marketplace-chat-realtime"    // Supabase Realtime para live updates (Fase 3)
  | "marketplace-reviews"          // Bloque D3: UI admin de reviews + moderación
  | "marketplace-reviews-public"   // Endpoint público /api/marketplace/reviews (create + vote)
  | "marketplace-reviews-widget";  // Widget de reviews en el storefront

// Default values — features that are already shipped
const DEFAULTS: Record<FeatureFlag, boolean> = {
  "bullmq-queues": true,
  "refresh-tokens": true,
  "rolling-releases": false,
  "redis-cache": false,
  "oauth-google": true,
  "oauth-facebook": false,
  "cursor-pagination": false,
  "ai-assistant-v2": false,
  "marketplace-v2": false,
  "whatsapp-bot": true,
  "push-notifications": true,
  "whatsapp-order-notifications": true,
  "auto-coupon-triggers": true,
  // Bloque D1 arranca OFF — se prende por env var FEATURE_DELIVERY_LIVE=true
  // una vez que la UI y el worker estén probados en preview.
  // Permite apagar en caliente si rompe prod (rollback < 5 min).
  "delivery-live": false,
  "delivery-live-whatsapp": false,
  "delivery-live-public-link": false,
  // Bloque D2 — Chat buyer ↔ seller. Todos arrancan OFF.
  "marketplace-chat": false,
  "marketplace-chat-public": false,
  "marketplace-chat-whatsapp": false,
  "marketplace-chat-realtime": false,
  // Bloque D3 — Reviews verificadas. Todos arrancan OFF.
  // marketplace-reviews: tab admin de moderación
  // marketplace-reviews-public: endpoints públicos (create + vote)
  // marketplace-reviews-widget: widget de reviews en storefront
  "marketplace-reviews": false,
  "marketplace-reviews-public": false,
  "marketplace-reviews-widget": false,
};

/**
 * Check if a feature is enabled.
 * Priority: env var > tenant override > default
 *
 * Env var format: FEATURE_BULLMQ_QUEUES=true
 */
export function isFeatureEnabled(flag: FeatureFlag, _tenantId?: string): boolean {
  // 1. Check env var override (FEATURE_BULLMQ_QUEUES=true/false)
  const envKey = `FEATURE_${flag.toUpperCase().replace(/-/g, "_")}`;
  const envVal = process.env[envKey];
  if (envVal !== undefined) {
    return envVal === "true" || envVal === "1";
  }

  // 2. Default value
  return DEFAULTS[flag] ?? false;
}

/**
 * Get all flags and their current values.
 * Useful for admin dashboard / debugging.
 */
export function getAllFlags(tenantId?: string): Record<FeatureFlag, boolean> {
  const result = {} as Record<FeatureFlag, boolean>;
  for (const flag of Object.keys(DEFAULTS) as FeatureFlag[]) {
    result[flag] = isFeatureEnabled(flag, tenantId);
  }
  return result;
}

/**
 * Log all feature flag values (call at startup).
 */
export function logFeatureFlags(tenantId?: string): void {
  const flags = getAllFlags(tenantId);
  logger.info("[feature-flags] Current state", { flags });
}
