/**
 * GET /api/marketplace/products/[id]
 *
 * Returns a single marketplace product with store info, images, and variants.
 * Public endpoint — no auth required (marketplace browsing).
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const productId = parseInt(id, 10);

  if (isNaN(productId) || productId <= 0) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  try {
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        active: true,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        price: true,
        image: true,
        unit: true,
        badge: true,
        stock: true,
        metaTitle: true,
        metaDescription: true,
        ogImage: true,
        images: {
          where: { url: { not: "" } },
          orderBy: { position: "asc" },
          select: { id: true, url: true, alt: true, isPrimary: true },
        },
        variants: {
          where: { isActive: true },
          orderBy: { position: "asc" },
          select: {
            id: true,
            name: true,
            sku: true,
            priceModifier: true,
            stock: true,
            attributesJson: true,
          },
        },
        storeProducts: {
          where: { isActive: true, store: { isPublished: true } },
          take: 1,
          select: {
            id: true,
            retailPrice: true,
            wholesalePrice: true,
            minOrderQty: true,
            store: {
              select: {
                id: true,
                name: true,
                slug: true,
                logo: true,
                description: true,
                zone: true,
              },
            },
          },
        },
      },
    });

    if (!product || product.storeProducts.length === 0) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const sp = product.storeProducts[0];
    const store = sp.store;

    return NextResponse.json({
      data: {
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        price: Number(sp.retailPrice),
        wholesalePrice: sp.wholesalePrice ? Number(sp.wholesalePrice) : null,
        basePrice: Number(product.price),
        unit: product.unit,
        badge: product.badge,
        stock: product.stock,
        image: product.image,
        metaTitle: product.metaTitle,
        metaDescription: product.metaDescription,
        ogImage: product.ogImage,
        images: product.images,
        variants: product.variants.map((v) => ({
          ...v,
          priceModifier: Number(v.priceModifier),
        })),
        storeProductId: sp.id,
        minOrderQty: sp.minOrderQty,
        store: {
          id: store.id,
          name: store.name,
          slug: store.slug,
          logo: store.logo,
          description: store.description,
          zone: store.zone,
        },
      },
    });
  } catch (err) {
    logger.error("[marketplace/products/[id]] Error", { error: String(err) });
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
