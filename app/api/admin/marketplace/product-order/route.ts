import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { invalidateByPrefix } from "@/lib/cache";
import { getProductOrder, setProductOrder } from "@/lib/store-product-order";
import { logger } from "@/lib/logger";

/**
 * GET/PUT /api/admin/marketplace/product-order
 *
 * Permite al admin del negocio reordenar los productos dentro de cada
 * categoría de SU PROPIA tienda. Storage en lib/data/store-product-orders.json
 * keyed por storeSlug + categoryName.
 *
 * El storefront /marketplace/[slug] lee este orden y reordena los productos
 * dentro de cada categoría antes de pasarlos a la grilla.
 */

const PutSchema = z.object({
  /** Mapa { categoryName: orderedProductIds[] } */
  byCategory: z.record(
    z.string().min(1).max(80),
    z.array(z.string().min(1).max(80)).max(500),
  ),
});

async function getCurrentStoreSlug(req: NextRequest): Promise<string | null> {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return null;
  const tenantId = auth.tenantId;
  const tenant = await prisma.tenant
    .findFirst({
      where: { OR: [{ id: tenantId }, { slug: tenantId }] },
      select: { id: true, slug: true },
    })
    .catch(() => null);
  if (!tenant) return null;
  const store = await prisma.store
    .findFirst({
      where: { tenantId: { in: [tenant.id, tenant.slug] } },
      select: { slug: true },
    })
    .catch(() => null);
  return store?.slug ?? null;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;
  try {
    const slug = await getCurrentStoreSlug(req);
    if (!slug) {
      return NextResponse.json({ byCategory: {}, storeSlug: null });
    }
    const byCategory = await getProductOrder(slug);
    return NextResponse.json({ byCategory, storeSlug: slug });
  } catch (err) {
    logger.error("[admin/marketplace/product-order GET]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
  }

  try {
    const slug = await getCurrentStoreSlug(req);
    if (!slug) {
      return NextResponse.json({ error: "no_store_for_tenant" }, { status: 404 });
    }
    await setProductOrder(slug, parsed.data.byCategory);
    invalidateByPrefix(`marketplace:store:${slug}`);
    return NextResponse.json({ ok: true, storeSlug: slug, byCategory: parsed.data.byCategory });
  } catch (err) {
    logger.error("[admin/marketplace/product-order PUT]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
