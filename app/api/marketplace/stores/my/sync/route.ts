export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { MarketplaceStoreProductsDB } from "@/lib/db/marketplace.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

/**
 * Resolve tenantId → ensure the Tenant record exists.
 * Returns both CUID and slug for searching across legacy and new data.
 */
async function resolveTenantId(tenantId: string): Promise<{ id: string; slug: string; possibleIds: string[] }> {
  const byId = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, slug: true } });
  if (byId) return { id: byId.id, slug: byId.slug, possibleIds: [byId.id, byId.slug] };
  const bySlug = await prisma.tenant.findUnique({ where: { slug: tenantId }, select: { id: true, slug: true } });
  if (bySlug) return { id: bySlug.id, slug: bySlug.slug, possibleIds: [bySlug.id, bySlug.slug] };
  // Auto-create tenant
  const tenant = await prisma.tenant.create({
    data: { slug: tenantId, name: tenantId, plan: "free", active: true },
  });
  return { id: tenant.id, slug: tenant.slug, possibleIds: [tenant.id, tenant.slug] };
}

// POST /api/marketplace/stores/my/sync — syncs ALL active inventory to marketplace
export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const tenant = await resolveTenantId(auth.tenantId);
    // Pass all possible tenant IDs so syncInventory can find existing data
    const result = await MarketplaceStoreProductsDB.syncInventory(tenant.id, tenant.possibleIds);

    return NextResponse.json({
      data: result,
      message: `Sincronización completada: ${result.created} nuevos, ${result.updated} reactivados, ${result.deactivated} desactivados.`,
    });
  } catch (err) {
    console.error("[POST /api/marketplace/stores/my/sync] Error:", err);
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
