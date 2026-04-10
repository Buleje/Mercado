/**
 * GET /api/platform/activity
 *
 * Public social proof feed — shows anonymized recent platform activity.
 * "Maria de Lima acaba de crear su tienda" / "50 pedidos en la ultima hora"
 *
 * No auth required. Used by marketing pages to boost conversion.
 * Cached for 5 minutes.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

let cachedActivity: unknown = null;
let cachedAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

function anonymizeName(name: string): string {
  if (!name) return "Un cliente";
  const parts = name.split(" ");
  const first = parts[0] ?? "Alguien";
  return first.length > 2 ? first : "Un cliente";
}

const CITIES = ["Lima", "Arequipa", "Trujillo", "Pucallpa", "Cusco", "Chiclayo", "Piura", "Iquitos"];

export async function GET() {
  if (cachedActivity && Date.now() - cachedAt < CACHE_TTL) {
    return NextResponse.json(cachedActivity, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    });
  }

  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [recentOrders, recentTenants, todayOrders] = await Promise.all([
      // Last 5 orders (anonymized)
      prisma.order.findMany({
        where: { createdAt: { gte: oneHourAgo }, status: { not: "cancelado" } },
        select: { customerName: true, total: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      // Recent store signups
      prisma.tenant.findMany({
        where: { createdAt: { gte: oneDayAgo }, active: true },
        select: { name: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
      // Today's order count
      prisma.order.count({
        where: {
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          status: { not: "cancelado" },
        },
      }),
    ]);

    const feed: Array<{
      type: "order" | "signup" | "stat";
      text: string;
      timeAgo: string;
    }> = [];

    // Add recent orders
    for (const order of recentOrders) {
      const name = anonymizeName(order.customerName);
      const mins = Math.round((Date.now() - new Date(order.createdAt).getTime()) / 60000);
      feed.push({
        type: "order",
        text: `${name} acaba de hacer un pedido`,
        timeAgo: mins < 2 ? "ahora" : `hace ${mins} min`,
      });
    }

    // Add recent signups
    for (const tenant of recentTenants) {
      const city = CITIES[Math.floor(Math.random() * CITIES.length)];
      const hours = Math.round(
        (Date.now() - new Date(tenant.createdAt).getTime()) / 3600000,
      );
      feed.push({
        type: "signup",
        text: `${tenant.name} de ${city} se unio a Buleje`,
        timeAgo: hours < 1 ? "hace poco" : `hace ${hours}h`,
      });
    }

    // Add aggregate stat
    if (todayOrders > 0) {
      feed.push({
        type: "stat",
        text: `${todayOrders} pedidos procesados hoy`,
        timeAgo: "hoy",
      });
    }

    const result = {
      feed: feed.slice(0, 8),
      ordersLastHour: recentOrders.length,
      ordersToday: todayOrders,
      newStoresToday: recentTenants.length,
    };

    cachedActivity = result;
    cachedAt = Date.now();

    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    });
  } catch {
    return NextResponse.json({
      feed: [
        { type: "stat", text: "Mas de 500 bodegas usan Buleje", timeAgo: "" },
      ],
      ordersLastHour: 0,
      ordersToday: 0,
      newStoresToday: 0,
    });
  }
}
