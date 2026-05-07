/**
 * GET /api/marketplace/products/check-exists?ids=1,2,3
 *
 * Endpoint público liviano: recibe una lista de product IDs y devuelve qué IDs
 * existen cross-store en el marketplace (no limitado al tenant del request).
 *
 * Caso de uso: validación defensiva del carrito en /marketplace, que puede
 * tener items de múltiples stores. El endpoint legacy `/api/products?active=true`
 * solo devolvía productos del tenant actual → borraba el carrito al hidratar
 * si los items venían de otros stores (bug 2026-04-19).
 *
 * Respuesta: { existingIds: number[], missingIds: number[] }
 * Límite: 100 IDs por request (evita abuso).
 */

/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const MAX_IDS = 100;

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids") ?? "";
  // FIX 2026-05-07: opcional tenantSlug — si el storefront es tenant-scoped
  // (/t/[slug]/tienda), filtra solo productos del tenant del slug. Sin el
  // parámetro mantiene comportamiento cross-store (marketplace).
  const tenantSlugParam = req.nextUrl.searchParams.get("tenantSlug")?.trim() ?? "";
  const productIds = idsParam
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n) && n > 0);

  if (productIds.length === 0) {
    return NextResponse.json({ existingIds: [], missingIds: [] });
  }

  const capped = productIds.slice(0, MAX_IDS);

  try {
    // Resolver slug → tenantId si vino el param. Sino cross-store.
    let tenantIdFilter: string | null = null;
    if (tenantSlugParam) {
      // eslint-disable-next-line no-restricted-properties -- public lookup; defensa: solo retorna existing IDs, no datos sensibles.
      const tenant = await prisma.tenant.findFirst({
        where: { OR: [{ id: tenantSlugParam }, { slug: tenantSlugParam }] },
        select: { id: true },
      });
      tenantIdFilter = tenant?.id ?? "__no-match__"; // no-match → arrays vacíos
    }

    // Cross-store si no hay tenantSlug; tenant-scoped si lo hay.
    const found = await prisma.product.findMany({
      where: {
        id: { in: capped },
        active: true,
        deletedAt: null,
        ...(tenantIdFilter ? { tenantId: tenantIdFilter } : {}),
      },
      select: { id: true },
    });

    const existingIds = found.map((p) => p.id);
    const foundSet = new Set(existingIds);
    const missingIds = capped.filter((id) => !foundSet.has(id));

    return NextResponse.json(
      { existingIds, missingIds },
      {
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        },
      },
    );
  } catch (err) {
    logger.warn("[marketplace/products/check-exists] soft-fail", {
      idsCount: capped.length,
      error: err instanceof Error ? err.message : String(err),
    });
    // Degrada a "todos existen" (no forzar eliminación en caller ante fallo).
    return NextResponse.json({ existingIds: capped, missingIds: [] });
  }
}
