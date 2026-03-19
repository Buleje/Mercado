/**
 * Feature Flags
 *
 * Runtime feature toggles stored in the Settings.featureFlagsJson column.
 * Flags can be toggled without a deployment via the admin UI or API.
 *
 * Usage:
 *   const enabled = await isFeatureEnabled("main", "loyalty_coupons");
 *   if (enabled) { ... }
 */

import { prisma } from "@/lib/prisma";

// ── Catalogue of known flags ──────────────────────────────────────────────────

export type FeatureFlag =
  | "loyalty_coupons"
  | "push_notifications"
  | "advanced_search"
  | "ai_suggestions"
  | "combo_manager"
  | "customer_portal"
  | "demand_prediction"
  | "whatsapp_integration"
  | "back_in_stock_alerts"
  | "product_comparisons"
  | "exit_intent_modal"
  | "abandoned_cart_recovery";

/** Default state for each flag when not explicitly stored. */
const DEFAULTS: Record<FeatureFlag, boolean> = {
  loyalty_coupons: true,
  push_notifications: false,
  advanced_search: true,
  ai_suggestions: false,
  combo_manager: true,
  customer_portal: false,
  demand_prediction: false,
  whatsapp_integration: false,
  back_in_stock_alerts: false,
  product_comparisons: false,
  exit_intent_modal: true,
  abandoned_cart_recovery: false,
};

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseFlags(json: string | null | undefined): Partial<Record<FeatureFlag, boolean>> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Partial<Record<FeatureFlag, boolean>>;
  } catch {
    return {};
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns `true` if the flag is enabled for the given tenant.
 * Falls back to the per-flag default if not explicitly configured.
 */
export async function isFeatureEnabled(
  tenantId: string,
  flag: FeatureFlag,
): Promise<boolean> {
  const settings = await prisma.settings.findUnique({
    where: { tenantId },
  }) as Record<string, unknown> | null;

  const stored = parseFlags(settings?.featureFlagsJson as string | null);

  return stored[flag] ?? DEFAULTS[flag];
}

/**
 * Returns all flags for a tenant (merged with defaults).
 */
export async function getFeatureFlags(
  tenantId: string,
): Promise<Record<FeatureFlag, boolean>> {
  const settings = await prisma.settings.findUnique({
    where: { tenantId },
  }) as Record<string, unknown> | null;

  const stored = parseFlags(settings?.featureFlagsJson as string | null);

  const flags = { ...DEFAULTS };
  for (const key of Object.keys(stored) as FeatureFlag[]) {
    if (key in DEFAULTS) {
      flags[key] = stored[key] as boolean;
    }
  }
  return flags;
}

/**
 * Enable or disable a single flag for a tenant.
 * Upserts the Settings row if it does not exist.
 */
export async function setFeatureFlag(
  tenantId: string,
  flag: FeatureFlag,
  enabled: boolean,
): Promise<void> {
  const current = await getFeatureFlags(tenantId);
  current[flag] = enabled;

  await prisma.settings.upsert({
    where: { tenantId },
    update: {
      featureFlagsJson: JSON.stringify(current),
    },
    create: {
      tenantId,
      featureFlagsJson: JSON.stringify(current),
    },
  });
}
