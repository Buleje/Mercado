/**
 * GET /api/marketplace/compare?name=arroz&productId=123
 *
 * Compares prices of the same product across multiple stores.
 * Returns stores sorted by price (cheapest first).
 *
 * Diferenciador: ningun competidor en Pucallpa ofrece comparacion de precios.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  name: z.string().min(1).optional(),
  productId: z.coerce.number().int().positive().optional(),
}).refine(d => d.name || d.productId, { message: "name or productId required" });

export async function GET(req: NextRequest) {
  try {
    const raw = {
      name: req.nextUrl.searchParams.get("name") ?? undefined,
      productId: req.nextUrl.searchParams.get("productId") ?? undefined,
    };

    const parsed = QuerySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "name o productId requerido", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { name, productId } = parsed.data;

    // Find products matching by name or ID across ALL tenants (marketplace is cross-tenant)
    const whereClause: Record<string, unknown> = { active: true };
    if (productId) {
      // Find the product name first, then search across stores
      const source = await prisma.product.findUnique({
        where: { id: productId },
        select: { name: true },
      });
      if (source) {
        whereClause.name = { contains: source.name, mode: "insensitive" };
      } else {
        return NextResponse.json({ data: [] });
      }
    } else if (name) {
      whereClause.name = { contains: name, mode: "insensitive" };
    }

    const storeProducts = await prisma.storeProduct.findMany({
      where: {
        isActive: true,
        product: whereClause,
      },
      select: {
        retailPrice: true,
        storeId: true,
        product: {
          select: { id: true, name: true, stock: true },
        },
        store: {
          select: {
            slug: true,
            name: true,
            logo: true,
            rating: true,
            isPublished: true,
          },
        },
      },
      take: 20,
      orderBy: { retailPrice: "asc" },
    });

    // Deduplicate by store (keep cheapest per store)
    const seen = new Set<string>();
    const data = storeProducts
      .filter(sp => {
        if (seen.has(sp.storeId)) return false;
        seen.add(sp.storeId);
        return true;
      })
      .map(sp => ({
        storeSlug: sp.store.slug,
        storeName: sp.store.name,
        storeLogo: sp.store.logo ?? null,
        storeRating: sp.store.rating ? Number(sp.store.rating) : null,
        price: Number(sp.retailPrice),
        originalPrice: null,
        inStock: (sp.product.stock ?? 0) > 0,
        deliveryAvailable: sp.store.isPublished,
      }));

    return NextResponse.json({ data });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error("[marketplace/compare] Error", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
