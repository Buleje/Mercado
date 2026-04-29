import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { MarketplaceStoreProductsDB } from "@/lib/db/marketplace.db";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

/**
 * Resolve tenantId → ensure the Tenant record exists.
 * Returns both CUID and slug for searching across legacy and new data.
 *
 * SECURITY (HOTFIX-A6, 2026-04-29): el auto-create fue eliminado de este
 * endpoint. La creación de tenants es responsabilidad EXCLUSIVA de
 * `/api/onboarding`. Si el tenant del JWT no existe en DB → 404.
 * (auth.tenantId viene del JWT verified, no es manipulable desde cliente,
 * pero remover el auto-create cierra una clase de smell donde un endpoint
 * de write podria crear tenants implícitamente).
 */
async function resolveTenantId(tenantId: string): Promise<{ id: string; slug: string; possibleIds: string[] } | null> {
  const byId = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, slug: true } });
  if (byId) return { id: byId.id, slug: byId.slug, possibleIds: [byId.id, byId.slug] };
  const bySlug = await prisma.tenant.findUnique({ where: { slug: tenantId }, select: { id: true, slug: true } });
  if (bySlug) return { id: bySlug.id, slug: bySlug.slug, possibleIds: [bySlug.id, bySlug.slug] };
  return null;
}

// POST /api/marketplace/stores/my/sync — syncs ALL active inventory to marketplace
export async function POST(req: NextRequest) {
  const traceId = newTraceId();
  try {
    const auth = await requireAdmin(req, ["admin", "manager"]);
    if (auth instanceof NextResponse) return auth;

    const tenant = await resolveTenantId(auth.tenantId);
    if (!tenant) {
      return NextResponse.json(
        { error: "Tenant inválido — completá onboarding primero" },
        { status: 404 },
      );
    }
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
