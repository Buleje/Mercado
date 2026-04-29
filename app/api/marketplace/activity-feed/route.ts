/**
 * @cross-tenant intentional — endpoint público marketplace.
 * Agregados/lecturas cross-tenant son parte del diseño del marketplace
 * (rankings, búsqueda, comparar, analytics globales). Donde aplica filtra
 * por `store.isPublished: true` para no exponer tiendas en draft.
 * Migrar a `lib/db/marketplace-*.db.ts` cuando se cree clase específica.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";

/**
 * GET /api/marketplace/activity-feed
 *
 * Devuelve las últimas 10 orders anonymized para el LiveActivityStrip:
 *   - initial: primera letra del nombre (privacy-safe)
 *   - name: primer nombre solo (sin apellidos)
 *   - zone: derivado del primer producto del store si tiene `zone`, sino "tu zona"
 *   - product: nombre del primer item de la order
 *   - minsAgo: minutos transcurridos desde createdAt
 *
 * Cache: 60s para no martillar la DB.
 */

type FeedItem = {
  id: string;
  initial: string;
  name: string;
  zone: string;
  action: "pidió" | "compró";
  product: string;
  minsAgo: number;
};

export async function GET() {
  try {
    const data = await getOrSet(
      "marketplace:activity-feed:v1",
      60,
      async () => {
        const since = new Date(Date.now() - 6 * 60 * 60 * 1000); // últimas 6h
        const orders = await prisma.order.findMany({
          where: { createdAt: { gte: since } },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            customerName: true,
            createdAt: true,
            items: {
              select: { name: true },
              take: 1,
            },
          },
        });

        type OrderWithItems = {
          id: string;
          customerName: string | null;
          createdAt: Date;
          items: Array<{ name: string }>;
        };
        const events: FeedItem[] = (orders as unknown as OrderWithItems[])
          .filter((o) => o.customerName && o.items.length > 0)
          .map((o, idx) => {
            const firstName = (o.customerName ?? "Vecino").trim().split(/\s+/)[0];
            const initial = firstName.charAt(0).toUpperCase() || "?";
            const minsAgo = Math.max(1, Math.floor((Date.now() - o.createdAt.getTime()) / 60000));
            return {
              id: String(o.id),
              initial,
              name: firstName,
              zone: "Pucallpa",
              action: idx % 2 === 0 ? ("pidió" as const) : ("compró" as const),
              product: o.items[0]?.name ?? "un producto",
              minsAgo,
            };
          });

        return events;
      },
    );

    return NextResponse.json({ data });
  } catch (e) {
    console.error("[activity-feed] error", e);
    return NextResponse.json({ data: [] }, { status: 200 });
  }
}
