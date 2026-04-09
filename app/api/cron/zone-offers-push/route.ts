import { NextRequest, NextResponse } from "next/server";
import { timingSafeCompare } from "@/lib/timing-safe";
import { withCronRetry } from "@/lib/cron-retry";
import { prisma } from "@/lib/prisma";
import { sendPushToPhone } from "@/lib/push-sender";
import { logger } from "@/lib/logger";

/**
 * GET /api/cron/zone-offers-push
 * Diario 12PM — Envía push con ofertas de tiendas cercanas a cada cliente,
 * basándose en el distrito del cliente y la zona de la tienda.
 */

// Mapeo distrito → zonas de tienda cercanas
const DISTRITO_ZONES: Record<string, string[]> = {
  "calleria": ["Callería", "Centro", "Todos"],
  "yarinacocha": ["Yarinacocha", "Todos"],
  "manantay": ["Manantay", "Centro", "Todos"],
  "coronel portillo": ["Coronel Portillo", "Callería", "Todos"],
  "campo verde": ["Coronel Portillo", "Todos"],
  "centro": ["Centro", "Callería", "Todos"],
  "pueblo libre": ["Pueblo Libre", "Centro", "Todos"],
  "ica yanayacu": ["Ica Yanayacu", "Centro", "Todos"],
};

function normalizeDistrito(d: string): string {
  return d.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !timingSafeCompare(auth, `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await withCronRetry("zone-offers-push", async () => {
      // 1. Find stores with active promotions or recently discounted products
      const activeStores = await prisma.store.findMany({
        where: { isPublished: true, zone: { not: null } },
        select: { id: true, name: true, zone: true, slug: true, tenantId: true },
      });

      if (activeStores.length === 0) return { sent: 0, reason: "No active stores" };

      // 2. Find featured products (badge = "Oferta") across marketplace stores
      const storeIds = activeStores.map((s) => s.id);
      const featuredProducts = await prisma.storeProduct.findMany({
        where: {
          storeId: { in: storeIds },
          isActive: true,
          product: {
            badge: "Oferta",
            active: true,
          },
        },
        select: {
          storeId: true,
          retailPrice: true,
          product: {
            select: { name: true, badge: true },
          },
        },
        take: 100,
      });

      // Group featured products by store zone
      const storeZoneMap = new Map(activeStores.map((s) => [s.id, s]));
      const offersByZone = new Map<string, { storeName: string; storeSlug: string; products: { name: string; discount: number; price: number }[] }[]>();

      for (const fp of featuredProducts) {
        const store = storeZoneMap.get(fp.storeId);
        if (!store?.zone) continue;

        const zone = store.zone;
        const list = offersByZone.get(zone) ?? [];
        let storeEntry = list.find((l) => l.storeSlug === store.slug);
        if (!storeEntry) {
          storeEntry = { storeName: store.name, storeSlug: store.slug ?? "", products: [] };
          list.push(storeEntry);
        }
        storeEntry.products.push({
          name: fp.product.name,
          discount: 0,
          price: fp.retailPrice,
        });
        offersByZone.set(zone, list);
      }

      // If no discounted products, pick random popular products from each zone's stores
      if (offersByZone.size === 0) {
        for (const store of activeStores) {
          if (!store.zone) continue;
          const products = await prisma.storeProduct.findMany({
            where: { storeId: store.id, isActive: true },
            select: { retailPrice: true, product: { select: { name: true } } },
            take: 3,
            orderBy: { retailPrice: "asc" },
          });
          if (products.length > 0) {
            const zone = store.zone;
            const list = offersByZone.get(zone) ?? [];
            list.push({
              storeName: store.name,
              storeSlug: store.slug ?? "",
              products: products.map((p) => ({ name: p.product.name, discount: 0, price: p.retailPrice })),
            });
            offersByZone.set(zone, list);
          }
        }
      }

      if (offersByZone.size === 0) return { sent: 0, reason: "No offers found" };

      // 3. Find customers with push subscriptions and districts
      const customersWithPush = await prisma.customer.findMany({
        where: {
          phone: { not: "" },
          distrito: { not: null },
        },
        // Customer no tiene campo 'firstName' — su campo es 'name'
        select: { phone: true, distrito: true, name: true },
      });

      // Check which phones have active push subscriptions
      const phones = customersWithPush.map((c) => c.phone);
      const activeSubs = await prisma.pushSubscription.findMany({
        where: { phone: { in: phones } },
        select: { phone: true },
      });
      const phonesWithPush = new Set(activeSubs.map((s) => s.phone).filter(Boolean));

      let sentCount = 0;

      for (const customer of customersWithPush) {
        if (!phonesWithPush.has(customer.phone)) continue;
        if (!customer.distrito) continue;

        const normalized = normalizeDistrito(customer.distrito);
        const matchingZones = DISTRITO_ZONES[normalized] ?? ["Todos"];

        // Collect offers from matching zones
        const customerOffers: { storeName: string; storeSlug: string; topProduct: string; discount: number; price: number }[] = [];
        for (const zone of matchingZones) {
          const zoneStores = offersByZone.get(zone) ?? [];
          for (const store of zoneStores) {
            if (store.products.length > 0) {
              const best = store.products.sort((a, b) => b.discount - a.discount)[0];
              customerOffers.push({
                storeName: store.storeName,
                storeSlug: store.storeSlug,
                topProduct: best.name,
                discount: best.discount,
                price: best.price,
              });
            }
          }
        }

        if (customerOffers.length === 0) continue;

        // Pick the best offer (highest discount or lowest price)
        const bestOffer = customerOffers.sort((a, b) => b.discount - a.discount)[0];

        const title = bestOffer.discount > 0
          ? `🔥 ¡${bestOffer.discount}% OFF en ${bestOffer.storeName}!`
          : `🏪 Ofertas cerca de ti en ${bestOffer.storeName}`;

        const body = bestOffer.discount > 0
          ? `${bestOffer.topProduct} a S/${bestOffer.price.toFixed(2)} — ¡solo hoy!`
          : `${bestOffer.topProduct} desde S/${bestOffer.price.toFixed(2)} — ¡visita tu tienda cercana!`;

        sendPushToPhone(customer.phone, {
          title,
          body,
          url: `/marketplace/tienda/${bestOffer.storeSlug}`,
        }).catch(() => {});

        sentCount++;
      }

      return { sent: sentCount, zones: offersByZone.size, customers: customersWithPush.length };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("zone-offers-push cron failed", { error: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
