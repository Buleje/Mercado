// @prisma-direct ok — cron endpoint cross-tenant (Vercel Cron horario).
// Itera Orders/Customers/SavedCarts de TODOS los tenants por timestamp y crea
// notificaciones usando el tenantId del registro fuente. Migración fragmentaría
// la lógica del cron sin aporte de aislamiento (cada notif lleva el tenantId
// original). Audit 2026-05-06 ya validó timing-safe header + fail-closed.
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

    // Brandon perf P0 #2a: batch lookup de counts y notificaciones existentes.
    // Antes: (order.count + customerNotif.findFirst + customerNotif.create) × N = 3xN queries.
    // Ahora: 1 groupBy + 1 findMany + 1 createMany = 3 queries totales independientes de N.
    const validPhones = recentOrders.map((o) => o.customerPhone).filter((p): p is string => !!p);

    if (validPhones.length > 0) {
      const [countsByPhone, existingWelcome] = await Promise.all([
        prisma.order.groupBy({
          by: ["customerPhone", "tenantId"],
          where: { customerPhone: { in: validPhones } },
          _count: { id: true },
        }),
        prisma.customerNotification.findMany({
          where: { customerPhone: { in: validPhones }, title: "¡Bienvenido a Buleje!" },
          select: { customerPhone: true, tenantId: true },
        }),
      ]);

      const countMap = new Map(
        countsByPhone.map((r) => [`${r.customerPhone}:${r.tenantId}`, r._count.id]),
      );
      const notifiedSet = new Set(existingWelcome.map((n) => `${n.customerPhone}:${n.tenantId}`));

      const toCreate = recentOrders.filter(({ customerPhone, tenantId }) => {
        if (!customerPhone) return false;
        const count = countMap.get(`${customerPhone}:${tenantId}`) ?? 0;
        return count === 1 && !notifiedSet.has(`${customerPhone}:${tenantId}`);
      });

      if (toCreate.length > 0) {
        await prisma.customerNotification.createMany({
          data: toCreate.map(({ tenantId, customerPhone }) => ({
            tenantId,
            customerPhone: customerPhone!,
            title: "¡Bienvenido a Buleje!",
            body: "Gracias por tu primer pedido. Como cliente nuevo, disfruta envío gratis en tu próxima compra. ¡Esperamos verte pronto! 🎉",
            type: "promotion",
          })),
          skipDuplicates: true,
        });
        results.welcome = toCreate.length;
      }
    }

    // ── 2. Post-delivery review request ─────────────────────
    const deliveredOrders = await prisma.order.findMany({
      where: {
        status: "entregado",
        updatedAt: { gte: twoHoursAgo },
      },
      select: { id: true, customerPhone: true, tenantId: true },
    });

    // Brandon perf P0 #2b: batch lookup de prefs de cliente y notificaciones existentes.
    // Antes: (customer.findUnique + customerNotif.findFirst + customerNotif.create) × N = 3xN.
    // Ahora: 1 findMany customers + 1 findMany notifs + 1 createMany = 3 queries totales.
    const deliveredPhones = deliveredOrders
      .map((o) => o.customerPhone)
      .filter((p): p is string => !!p);

    if (deliveredPhones.length > 0) {
      const deliveredOrderIds6 = deliveredOrders.map((o) => o.id.slice(-6));

      const [customersWithPrefs, existingReviewNotifs] = await Promise.all([
        prisma.customer.findMany({
          where: { phone: { in: deliveredPhones } },
          select: { phone: true, notifOrderUpdates: true },
        }),
        prisma.customerNotification.findMany({
          where: {
            customerPhone: { in: deliveredPhones },
            title: "¿Cómo fue tu pedido?",
            // Filtramos las que ya tienen el id de alguna de las ordenes procesadas
            body: { contains: deliveredOrderIds6[0] ?? "" },
          },
          select: { body: true, customerPhone: true },
        }),
      ]);

      const prefsMap = new Map(customersWithPrefs.map((c) => [c.phone, c.notifOrderUpdates]));
      // Para el dedup: set de "phone:orderId6" ya notificados
      const reviewedSet = new Set(
        existingReviewNotifs.map((n) => {
          const match = deliveredOrderIds6.find((id6) => n.body.includes(id6));
          return match ? `${n.customerPhone}:${match}` : null;
        }).filter((k): k is string => k !== null),
      );

      const reviewsToCreate = deliveredOrders.filter((order) => {
        if (!order.customerPhone) return false;
        if (!prefsMap.get(order.customerPhone)) return false;
        return !reviewedSet.has(`${order.customerPhone}:${order.id.slice(-6)}`);
      });

      if (reviewsToCreate.length > 0) {
        await prisma.customerNotification.createMany({
          data: reviewsToCreate.map((order) => ({
            tenantId: order.tenantId,
            customerPhone: order.customerPhone!,
            title: "¿Cómo fue tu pedido?",
            body: `Tu pedido #${order.id.slice(-6)} fue entregado. ¡Cuéntanos cómo te fue! Tu opinión nos ayuda a mejorar. ⭐`,
            type: "order",
          })),
          skipDuplicates: true,
        });
        results.review = reviewsToCreate.length;
      }
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
