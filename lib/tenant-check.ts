import "server-only";
import { getOrSet } from "@/lib/cache";
import { findTenantByIdOrSlug } from "@/lib/tenant";

/**
 * Check if a tenant slug or ID exists in the database.
 * Cached for 5 minutes to avoid repeated DB hits on every page load.
 * Returns the tenant slug if found, null otherwise.
 *
 * Brandon 2026-05-16 (Fase 3): usa el helper memoizado con React.cache
 * para deduplicar el lookup dentro del mismo request.
 */
export async function tenantExists(slugOrId: string): Promise<boolean> {
  if (slugOrId === "main") return true;

  return getOrSet<boolean>(`tenant-exists:${slugOrId}`, 300, async () => {
    const tenant = await findTenantByIdOrSlug(slugOrId);
    return !!tenant && tenant.active;
  });
}
