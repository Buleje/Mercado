import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { timingSafeCompare } from "@/lib/timing-safe";

/**
 * GET /api/email-automation — Automated customer lifecycle notifications.
 * Triggered via Vercel Cron every hour.
 *
 * SECURITY 2026-05-06 (audit email #4): comparación timing-safe + fail-closed
 * si CRON_SECRET no está configurado. Antes `===` permitía timing attack.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") ?? "";
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error("[email-automation] CRON_SECRET no configurado");
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
  if (!timingSafeCompare(authHeader, `Bearer ${cronSecret}`)) {
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
      select: { customerPhone: true, tenantId: true },
      distinct: ["customerPhone"],
    });

    for (const { customerPhone, tenantId } of recentOrders) {
      if (!customerPhone) continue;
      const orderCount = await prisma.order.count({ where: { customerPhone, tenantId } });
      if (orderCount !== 1) continue; // only first order

      // Check if welcome notification already sent
      const existing = await prisma.customerNotification.findFirst({
        where: { customerPhone, tenantId, title: "¡Bienvenido a Buleje!" },
      });
      if (existing) continue;

      await prisma.customerNotification.create({
        data: {
          tenantId,
          customerPhone,
          title: "¡Bienvenido a Buleje!",
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
      select: { id: true, customerPhone: true, tenantId: true },
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
        where: { customerPhone: order.customerPhone, tenantId: order.tenantId, body: { contains: order.id.slice(-6) } },
      });
      if (existing) continue;

      await prisma.customerNotification.create({
        data: {
          tenantId: order.tenantId,
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
      select: { customerPhone: true, itemsJson: true, tenantId: true },
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
          tenantId: cart.tenantId,
          title: "¡No olvides tu carrito!",
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60_000) },
        },
      });
      if (recentReminder) continue;

      const firstItems = items.slice(0, 2).map(i => i.name).join(", ");
      await prisma.customerNotification.create({
        data: {
          tenantId: cart.tenantId,
          customerPhone: cart.customerPhone,
          title: "¡No olvides tu carrito!",
          body: `Tienes ${items.length} producto${items.length > 1 ? "s" : ""} esperando: ${firstItems}${items.length > 2 ? "…" : ""}. ¡Completa tu pedido! 🛒`,
          type: "promotion",
        },
      });
      results.abandoned++;
    }
  } catch (e) {
    logger.error("[email-automation] Error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Automation failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ...results });
}
