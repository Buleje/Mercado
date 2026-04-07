export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { prisma } from "@/lib/prisma";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const QuerySchema = z.object({
  q:        z.string().min(1).max(100),
  zone:     z.string().optional(),
  category: z.string().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  sort:     z.enum(["price_asc", "price_desc", "name", "rating", "distance"]).optional(),
  lat:      z.coerce.number().optional(),
  lng:      z.coerce.number().optional(),
  radiusKm: z.coerce.number().min(0).max(100).optional(),
});

// Coordenadas aproximadas por zona (Pucallpa) — fallback para tiendas sin GPS exacto
const ZONE_COORDS: Record<string, [number, number]> = {
  centro:        [-8.3808, -74.5333],
  manantay:      [-8.4031, -74.5156],
  calleria:      [-8.37,   -74.55],
  yarinacocha:   [-8.2556, -74.5111],
  campo_verde:   [-8.3833, -74.4667],
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function zoneToCoords(zone: string | null): [number, number] | null {
  if (!zone) return null;
  const key = zone.toLowerCase().replace(/[- ]/g, "_");
  return ZONE_COORDS[key] ?? null;
}

type RawResult = {
  id: string;
  retailPrice: number;
  minOrderQty: number;
  product: {
    id: number;
    name: string;
    image: string | null;
    category: string;
    unit: string | null;
  };
  store: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
    zone: string | null;
    rating: number;
  };
};

export async function GET(req: NextRequest) {
  const traceId = newTraceId();
  const requestId = req.headers.get("x-request-id") ?? traceId;

  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      logger.warn("marketplace/search: parámetros inválidos", { requestId, issues: parsed.error.issues });
      return NextResponse.json(
        { error: "Parámetros inválidos", issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const { q, zone, category, minPrice, maxPrice, sort, lat, lng, radiusKm } = parsed.data;

    logger.info("marketplace/search", { requestId, q, zone, category, sort, minPrice, maxPrice });

    // orderBy en Prisma solo para los casos que el ORM puede resolver directamente
    const prismaOrderBy =
      sort === "price_desc"
        ? { retailPrice: "desc" as const }
        : sort === "name"
          ? { product: { name: "asc" as const } }
          : sort === "rating"
            ? { store: { rating: "desc" as const } }
            : { retailPrice: "asc" as const }; // price_asc | distance | default

    const results: RawResult[] = await prisma.storeProduct.findMany({
      where: {
        isActive: true,
        ...(minPrice !== undefined || maxPrice !== undefined
          ? {
              retailPrice: {
                ...(minPrice !== undefined && { gte: minPrice }),
                ...(maxPrice !== undefined && { lte: maxPrice }),
              },
            }
          : {}),
        store: {
          isPublished: true,
          ...(zone && { zone }),
        },
        product: {
          name: { contains: q, mode: "insensitive" },
          ...(category && category !== "todos" && { category }),
        },
      },
      select: {
        id:          true,
        retailPrice: true,
        minOrderQty: true,
        product: {
          select: {
            id:       true,
            name:     true,
            image:    true,
            category: true,
            unit:     true,
          },
        },
        store: {
          select: {
            id:     true,
            name:   true,
            slug:   true,
            logo:   true,
            zone:   true,
            rating: true,
          },
        },
      },
      orderBy: prismaOrderBy,
      take: 80, // margen para ordenar por distancia en post-process
    });

    // Post-process: filtrar/ordenar por distancia cuando el cliente envía coordenadas GPS
    let finalResults = results;

    if (lat !== undefined && lng !== undefined) {
      const radius = radiusKm ?? 5;

      // Filtrar por radio (solo si la tienda tiene zona con coords aproximadas)
      finalResults = results.filter((r) => {
        const coords = zoneToCoords(r.store.zone);
        if (!coords) return true; // sin coords → incluir (beneficio de la duda)
        return haversineKm(lat, lng, coords[0], coords[1]) <= radius;
      });

      // Ordenar por cercanía si se solicitó
      if (sort === "distance") {
        finalResults = [...finalResults].sort((a, b) => {
          const coordsA = zoneToCoords(a.store.zone);
          const coordsB = zoneToCoords(b.store.zone);
          const distA = coordsA ? haversineKm(lat, lng, coordsA[0], coordsA[1]) : 9999;
          const distB = coordsB ? haversineKm(lat, lng, coordsB[0], coordsB[1]) : 9999;
          return distA - distB;
        });
      }
    }

    const data = finalResults.slice(0, 50).map((r) => ({
      productId:   r.product.id,
      productName: r.product.name,
      price:       r.retailPrice,
      image:       r.product.image,
      unit:        r.product.unit,
      category:    r.product.category,
      storeId:     r.store.id,
      storeName:   r.store.name,
      storeSlug:   r.store.slug,
      storeLogo:   r.store.logo,
      storeZone:   r.store.zone,
      storeRating: r.store.rating,
      stock:       r.minOrderQty ?? 0,
    }));

    return NextResponse.json({ data, total: data.length, query: q });
  } catch (err) {
    logger.error("marketplace/search: error inesperado", { requestId, err });
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
