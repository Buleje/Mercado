import "server-only";
import { prisma } from "@/lib/prisma";

/** Custom-domain prefix injected by edge middleware */
const CUSTOM_PREFIX = "custom--";
const LEGACY_CUSTOM_PREFIX = "custom:";

/**
 * In-process cache: custom_hostname → tenant_slug.
 * TTL: 5 minutes. Cleared on each server restart (good enough for
 * a low-churn SaaS where domains are rarely changed).
 */
const cache = new Map<string, { slug: string; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Given a raw `x-tenant-id` value, return the real tenant slug.
 *
 * - "main"                  → "main"
 * - "acme"                  → "acme"          (subdomain, pass-through)
 * - "custom--www.tienda.com" → looks up Tenant.customDomain in DB
 *
 * Returns null when a custom domain is not found in the DB (unknown visitor).
 */
export async function resolveTenantSlug(
  rawTenantId: string
): Promise<string | null> {
  const hostname = getCustomDomainHostname(rawTenantId);
  if (!hostname) {
    // Plain slug — trust as-is
    return rawTenantId;
  }

  // Cache hit
  const cached = cache.get(hostname);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.slug;
  }

  // DB lookup
  const tenant = await prisma.tenant.findFirst({
    where: { customDomain: hostname, active: true },
    select: { slug: true },
  });

  if (!tenant) return null;

  cache.set(hostname, { slug: tenant.slug, expiresAt: Date.now() + CACHE_TTL_MS });
  return tenant.slug;
}

/** Invalidate a cached custom domain entry (call after updating/removing). */
export function invalidateCustomDomainCache(hostname: string) {
  cache.delete(hostname.toLowerCase());
}

function getCustomDomainHostname(rawTenantId: string): string | null {
  if (rawTenantId.startsWith(CUSTOM_PREFIX)) {
    return rawTenantId.slice(CUSTOM_PREFIX.length).toLowerCase();
  }

  if (rawTenantId.startsWith(LEGACY_CUSTOM_PREFIX)) {
    return rawTenantId.slice(LEGACY_CUSTOM_PREFIX.length).toLowerCase();
  }

  return null;
}
