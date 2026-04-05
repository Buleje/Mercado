import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";

/**
 * Check if a tenant slug or ID exists in the database.
 * Cached for 5 minutes to avoid repeated DB hits on every page load.
 * Returns the tenant slug if found, null otherwise.
 */
export async function tenantExists(slugOrId: string): Promise<boolean> {
  if (slugOrId === "main") return true;

  return getOrSet<boolean>(`tenant-exists:${slugOrId}`, 300, async () => {
    const row = await prisma.tenant.findFirst({
      where: {
        OR: [{ slug: slugOrId }, { id: slugOrId }],
        active: true,
      },
      select: { id: true },
    });
    return !!row;
  });
}
