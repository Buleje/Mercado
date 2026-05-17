import "server-only";
import { findTenantBillingByIdOrSlug } from "@/lib/tenant";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TenantAccessResult {
  allowed: boolean;
  reason?: "suspended" | "trial_expired" | "not_found";
  /** ISO string of when the trial ended (only when reason = "trial_expired") */
  trialEndedAt?: string;
}

// ─── Core functions ───────────────────────────────────────────────────────────

/**
 * Check whether a tenant is allowed to serve requests.
 * Returns `allowed: false` if the tenant is suspended or its free trial has expired.
 */
export async function checkTenantAccess(tenantSlug: string): Promise<TenantAccessResult> {
  // Brandon 2026-05-16 (Fase 2 perf): usa el helper memoizado con React.cache
  // para deduplicar findTenant dentro del mismo request (antes 3× por render).
  const tenant = await findTenantBillingByIdOrSlug(tenantSlug);

  if (!tenant) return { allowed: false, reason: "not_found" };
  if (!tenant.active) return { allowed: false, reason: "suspended" };

  // Free tenants with no Stripe subscription are subject to trial expiry.
  if (
    tenant.plan === "free" &&
    !tenant.stripeSubscriptionId &&
    tenant.trialEndsAt &&
    new Date(tenant.trialEndsAt) < new Date()
  ) {
    return {
      allowed: false,
      reason: "trial_expired",
      trialEndedAt: tenant.trialEndsAt.toISOString(),
    };
  }

  return { allowed: true };
}

/**
 * Quick synchronous check — pass the tenant row if you already have it.
 */
export function isTrialActive(trialEndsAt: Date | null): boolean {
  if (!trialEndsAt) return true; // no trial configured = not subject to trial expiry
  return trialEndsAt > new Date();
}
