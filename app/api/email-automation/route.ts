export const dynamic = "force-dynamic";

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/email-automation — Automated customer lifecycle notifications.
 * Triggered via Vercel Cron every hour.
 *
 * 1. Welcome: first-time customers (1 order placed in last 2h) → bell notification
 * 2. Post-delivery review request: orders delivered in last 2h → bell notification
 * 3. Abandoned cart reminder: SavedCart updated >1h ago → bell notification
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const results = { welcome: 0, review: 0, abandoned: 0 };

  try {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000);
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60_000);

    // ── 1. Welcome notifications ───────────────────────────
    // Find customers whose first order was placed in the last 2h
    const recentOrders = await prisma.order.findMany({
      where: { createdAt: { gte: twoHoursAgo } },
      select: { customerPhone: true },
      distinct: ["customerPhone"],
    });

    for (const { customerPhone } of recentOrders) {
      if (!customerPhone) continue;
      const orderCount = await prisma.order.count({ where: { customerPhone } });
      if (orderCount !== 1) continue; // only first order

      // Check if welcome notification already sent
      const existing = await prisma.customerNotification.findFirst({
        where: { customerPhone, title: "¡Bienvenido a Bodega San Martín!" },
      });
      if (existing) continue;

      await prisma.customerNotification.create({
        data: {
          customerPhone,
          title: "¡Bienvenido a Bodega San Martín!",
          body: "Gracias por tu primer pedido. Como cliente nuevo, disfruta envío gratis en tu próxima compra. ¡Esperamos verte pronto! 🎉",
          type: "promotion",
        },
      });
      results.welcome++;
    }

    // ── 2. Post-delivery review request ─────────────────────
    const deliveredOrders = await prisma.order.findMany({
      where: {
        status: "entregado",
        updatedAt: { gte: twoHoursAgo },
      },
      select: { id: true, customerPhone: true },
    });

    for (const order of deliveredOrders) {
      if (!order.customerPhone) continue;
      // Check preferences
      const customer = await prisma.customer.findUnique({
        where: { phone: order.customerPhone },
        select: { notifOrderUpdates: true },
      });
      if (!customer?.notifOrderUpdates) continue;

      // Check if review request already sent for this order
      const existing = await prisma.customerNotification.findFirst({
        where: { customerPhone: order.customerPhone, body: { contains: order.id.slice(-6) } },
      });
      if (existing) continue;

      await prisma.customerNotification.create({
        data: {
          customerPhone: order.customerPhone,
          title: "¿Cómo fue tu pedido?",
          body: `Tu pedido #${order.id.slice(-6)} fue entregado. ¡Cuéntanos cómo te fue! Tu opinión nos ayuda a mejorar. ⭐`,
          type: "order",
        },
      });
      results.review++;
    }

    // ── 3. Abandoned cart reminder ──────────────────────────
    const abandonedCarts = await prisma.savedCart.findMany({
      where: {
        updatedAt: { lte: oneHourAgo, gte: twoHoursAgo },
      },
      select: { customerPhone: true, itemsJson: true },
    });

    for (const cart of abandonedCarts) {
      // Parse items to check if cart is non-empty
      let items: { name: string }[] = [];
      try { items = JSON.parse(cart.itemsJson); } catch { continue; }
      if (items.length === 0) continue;

      // Check if reminder already sent recently (last 24h)
      const recentReminder = await prisma.customerNotification.findFirst({
        where: {
          customerPhone: cart.customerPhone,
          title: "¡No olvides tu carrito!",
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
        },
      });
      if (recentReminder) continue;

      const firstItems = items.slice(0, 2).map(i => i.name).join(", ");
      await prisma.customerNotification.create({
        data: {
          customerPhone: cart.customerPhone,
          title: "¡No olvides tu carrito!",
          body: `Tienes ${items.length} producto${items.length > 1 ? "s" : ""} esperando: ${firstItems}${items.length > 2 ? "…" : ""}. ¡Completa tu pedido! 🛒`,
          type: "promotion",
        },
      });
      results.abandoned++;
    }
  } catch (e) {
    console.error("[email-automation] Error:", e);
    return NextResponse.json({ error: "Automation failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...results });
}
