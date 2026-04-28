import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/require-admin";
import { invalidateByPrefix } from "@/lib/cache";
import { getCategoryOrder, setCategoryOrder } from "@/lib/store-category-order";
import { logger } from "@/lib/logger";

/**
 * GET/PUT /api/admin/marketplace/category-order
 *
 * Permite al admin del negocio reordenar las categorías de SU PROPIA tienda
 * (la que pertenece al tenant actual). Storage: lib/data/store-category-orders.json
 * keyed por storeSlug. El storefront /marketplace/[slug] lee este orden
 * server-side y reordena `<StoreCategories />` antes de renderizar.
 */

const PutSchema = z.object({
  /** Array ordenado de category ids tal como aparecen en StoreCategoryChip.id */
  order: z.array(z.string().min(1).max(80)).max(200),
});

async function getCurrentStoreSlug(req: NextRequest): Promise<string | null> {
  const auth = await requireAdmin(req, ["admin", "manager"]);
  if (auth instanceof NextResponse) return null;
  const tenantId = auth.tenantId;
  // tenantId puede ser CUID o slug — buscamos ambos.
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
      return NextResponse.json({ order: [], storeSlug: null });
    }
    const order = await getCategoryOrder(slug);
    return NextResponse.json({ order, storeSlug: slug });
  } catch (err) {
    logger.error("[admin/marketplace/category-order GET]", { error: String(err) });
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
    await setCategoryOrder(slug, parsed.data.order);
    invalidateByPrefix(`marketplace:store:${slug}`);
    return NextResponse.json({ ok: true, storeSlug: slug, order: parsed.data.order });
  } catch (err) {
    logger.error("[admin/marketplace/category-order PUT]", { error: String(err) });
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
