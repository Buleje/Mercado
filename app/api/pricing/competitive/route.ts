export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

const MARGIN_BELOW = 0.20; // 20% debajo del promedio → sugerir "Subir"
const MARGIN_ABOVE = 0.20; // 20% arriba del promedio → sugerir "Bajar"

type Suggestion = "Subir" | "Bajar" | "OK" | "Sin datos";

interface PricingResult {
  id: string;
  productId: string;
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

    // Obtener los productos del tenant actual
    const myProducts = await prisma.storeProduct.findMany({
      where: {
        tenantId: auth.tenantId,
        isActive: true,
        ...(productId ? { productId } : {}),
      },
      include: {
        product: { select: { id: true, name: true } },
      },
    });

    if (myProducts.length === 0) {
      return NextResponse.json({ products: [] });
    }

    // Para cada producto del tenant, buscar precios de OTROS tenants
    const settled = await Promise.allSettled(
      myProducts.map(async (sp): Promise<PricingResult> => {
        const competitors = await prisma.storeProduct.findMany({
          where: {
            productId: sp.productId,
            isActive: true,
            NOT: { tenantId: auth.tenantId },
          },
          select: { retailPrice: true },
        });

        const prices = competitors
          .map((c) => Number(c.retailPrice))
          .filter((p) => p > 0);

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
