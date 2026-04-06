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
  | "bullmq-queues"        // Use BullMQ instead of fire-and-forget
  | "refresh-tokens"       // Use access+refresh token rotation
  | "rolling-releases"     // Canary deployments on Vercel
  | "redis-cache"          // Use Redis-backed cache
  | "oauth-google"         // Google OAuth login for customers
  | "cursor-pagination"    // Cursor-based pagination
  | "ai-assistant-v2"      // Next-gen AI assistant
  | "marketplace-v2"       // Enhanced marketplace features
  | "whatsapp-bot"         // WhatsApp chatbot integration
  | "push-notifications";  // Web push notifications

// Default values — features that are already shipped
const DEFAULTS: Record<FeatureFlag, boolean> = {
  "bullmq-queues": true,
  "refresh-tokens": true,
  "rolling-releases": false,
  "redis-cache": false,
  "oauth-google": false,
  "cursor-pagination": false,
  "ai-assistant-v2": false,
  "marketplace-v2": false,
  "whatsapp-bot": true,
  "push-notifications": true,
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
