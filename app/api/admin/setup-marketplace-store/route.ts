import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/setup-marketplace-store
 * Creates a Store record + StoreProducts for the current tenant
 * so products appear in the marketplace.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const tenantId = auth.tenantId;

    // Resolve tenant for slug
    const tenant = await prisma.tenant.findFirst({
      where: { OR: [{ id: tenantId }, { slug: tenantId }] },
      select: { id: true, slug: true, name: true },
    });
    if (!tenant) {
      return NextResponse.json({ error: "Tenant no encontrado" }, { status: 404 });
    }

    // Upsert Store record
    const store = await prisma.store.upsert({
      where: { slug: tenant.slug },
      update: {
        name: tenant.name || `Bodega ${tenant.slug}`,
        isPublished: true,
      },
      create: {
        tenantId: tenant.id,
        slug: tenant.slug,
        name: tenant.name || `Bodega ${tenant.slug}`,
        description: `Tienda oficial de ${tenant.name || tenant.slug}`,
        category: "bodega",
        isPublished: true,
        commission: 0,
      },
    });

    // Get all active products for this tenant
    const products = await prisma.product.findMany({
      where: { tenantId: { in: [tenant.id, tenant.slug] }, active: true, deletedAt: null },
      select: { id: true, price: true },
    });

    // Create StoreProduct entries for products not yet linked
    const existingLinks = await prisma.storeProduct.findMany({
      where: { storeId: store.id },
      select: { productId: true },
    });
    const linkedIds = new Set(existingLinks.map((l) => l.productId));

    const toCreate = products.filter((p) => !linkedIds.has(p.id));

    if (toCreate.length > 0) {
      await prisma.storeProduct.createMany({
        data: toCreate.map((p) => ({
          storeId: store.id,
          productId: p.id,
          retailPrice: p.price,
          isActive: true,
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      store: { id: store.id, slug: store.slug, name: store.name },
      productsLinked: toCreate.length,
      totalProducts: products.length,
      message: `✅ Tienda "${store.name}" publicada en marketplace con ${products.length} productos.`,
    });
  } catch (e) {
    logger.error("[setup-marketplace-store] error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error al configurar tienda marketplace" }, { status: 500 });
  }
}
