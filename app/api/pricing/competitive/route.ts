import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

const MARGIN_BELOW = 0.20; // 20% debajo del promedio → sugerir "Subir"
const MARGIN_ABOVE = 0.20; // 20% arriba del promedio → sugerir "Bajar"

type Suggestion = "Subir" | "Bajar" | "OK" | "Sin datos";

interface PricingResult {
  id: string;
  productId: number;
  name: string;
  myPrice: number;
  avgPrice: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  suggestion: Suggestion;
  competitorCount: number;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin", "cajero"]);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const productId = searchParams.get("productId");

    // Find the store for this tenant
    const myStore = await prisma.store.findFirst({
      where: { tenantId: auth.tenantId },
      select: { id: true },
    });

    if (!myStore) {
      return NextResponse.json({ products: [] });
    }

    // Obtener los productos del tenant actual via storeId
    const myProducts = await prisma.storeProduct.findMany({
      where: {
        storeId: myStore.id,
        isActive: true,
        ...(productId ? { productId: Number(productId) } : {}),
      },
      include: {
        product: { select: { id: true, name: true } },
      },
    });

    if (myProducts.length === 0) {
      return NextResponse.json({ products: [] });
    }

    // SECURITY 2026-05-07 (audit perf P0-2): un solo findMany WHERE productId IN (...)
    // en vez de N queries serializadas. Antes 100 productos × 1 query =100 queries.
    // Ahora 1 query y pivot en JS.
    const productIds = myProducts.map((sp) => sp.productId);
    const allCompetitors = await prisma.storeProduct.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
        NOT: { storeId: myStore.id },
      },
      select: { productId: true, retailPrice: true },
    });

    // Index competitors by productId para lookup O(1)
    const competitorsByProduct = new Map<number, number[]>();
    for (const c of allCompetitors) {
      const price = Number(c.retailPrice);
      if (!(price > 0)) continue;
      const arr = competitorsByProduct.get(c.productId) ?? [];
      arr.push(price);
      competitorsByProduct.set(c.productId, arr);
    }

    const settled = await Promise.allSettled(
      myProducts.map(async (sp): Promise<PricingResult> => {
        const prices = competitorsByProduct.get(sp.productId) ?? [];
        const myPrice = Number(sp.retailPrice);
        const competitorCount = prices.length;

        if (competitorCount === 0) {
          return {
            id: sp.id,
            productId: sp.productId,
            name: sp.product.name,
            myPrice,
            avgPrice: null,
            minPrice: null,
            maxPrice: null,
            suggestion: "Sin datos",
            competitorCount: 0,
          };
        }

        const avgPrice = prices.reduce((s, p) => s + p, 0) / prices.length;
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);

        let suggestion: Suggestion;
        if (myPrice < avgPrice * (1 - MARGIN_BELOW)) {
          suggestion = "Subir";
        } else if (myPrice > avgPrice * (1 + MARGIN_ABOVE)) {
          suggestion = "Bajar";
        } else {
          suggestion = "OK";
        }

        return {
          id: sp.id,
          productId: sp.productId,
          name: sp.product.name,
          myPrice,
          avgPrice: Math.round(avgPrice * 100) / 100,
          minPrice: Math.round(minPrice * 100) / 100,
          maxPrice: Math.round(maxPrice * 100) / 100,
          suggestion,
          competitorCount,
        };
      })
    );

    const products: PricingResult[] = settled
      .filter((r): r is PromiseFulfilledResult<PricingResult> => r.status === "fulfilled")
      .map((r) => r.value);

    return NextResponse.json({ products });
  } catch {
    return NextResponse.json({ error: "Error del servidor" }, { status: 503 });
  }
}
