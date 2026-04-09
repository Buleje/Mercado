import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OrdersDB, CouponsDB, PromotionsDB } from "@/lib/jsondb";
import type { DbOrder } from "@/lib/jsondb";
import { emitAdminSSE } from "@/lib/sse-emitter";
import { sendOrderNotification } from "@/lib/mailer";
import { sendWhatsAppNotification, getWhatsAppLink, sendWhatsAppText } from "@/lib/whatsapp";
import { sendReceiptByWhatsApp } from "@/lib/receipt-whatsapp";
import { sendPushToPhone } from "@/lib/push-sender";
import { logActivity } from "@/lib/activity-logger";
import { requireAdmin } from "@/lib/require-admin";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { InventoryMovementsDB } from "@/lib/db/inventory.db";
import { resolveTenantSlug } from "@/lib/resolve-tenant";
import { getPlanLimits, withinLimit, planLimitPayload } from "@/lib/plans";
import { logger } from "@/lib/logger";
import { getOrSet } from "@/lib/cache";
import { createDefaultDiscountEngine } from "@/lib/pricing/discount-strategies";
import type { OrderContext } from "@/lib/pricing/discount-strategies";

const OrderItemSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(200),
  price: z.number().min(0),
  quantity: z.number().min(1),
  unit: z.string().max(30).optional(),
  image: z.string().max(500).optional(),
  category: z.string().optional(),
  badge: z.string().nullable().optional(),
});

const OrderPostSchema = z.object({
  customer: z.object({
    name: z.string().min(1).max(100),
    phone: z.string().min(6).max(20).optional(),
    location: z.string().max(500).optional(),
    reference: z.string().max(300).optional(),
  }),
  items: z.array(OrderItemSchema).min(1),
  total: z.number().min(0), // client hint; server will recompute
  paymentMethod: z.enum(["yape", "efectivo"]).optional().default("efectivo"),
  notes: z.string().max(1000).optional(),
  deliverySlot: z.string().max(100).optional(),
  // Discount tracking fields
  appliedCouponCode: z.string().max(50).optional(),
  couponDiscount: z.number().min(0).optional(),     // server re-verifies this
  appliedPromoId: z.string().max(200).optional(),
  discountAmount: z.number().min(0).optional(),     // ignored by server — server recomputes from DB promo
  // Payment details
  yapeOperationNumber: z.string().max(50).optional(),
  deuda: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "orders-get");
  if (rl) return rl;

  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get("status");      // e.g. "pendiente"
    const limitParam   = searchParams.get("limit");       // default: all
    const pageParam    = searchParams.get("page");        // offset pagination page
    const cursorParam  = searchParams.get("cursor");      // cursor-based pagination
    const sinceParam   = searchParams.get("since");       // ISO date string
    const phoneParam   = searchParams.get("phone");       // filter by customer phone

    // ── Cursor-based pagination (preferred — DB-level, scales to large datasets) ──
    if (cursorParam !== null || (limitParam && !pageParam)) {
      const limit = limitParam
        ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 200)
        : 50;
      const { orders, nextCursor, total } = await withDbRetry(() =>
        OrdersDB.getPage({
          cursor: cursorParam ?? undefined,
          limit,
          status: statusFilter ?? undefined,
          since:  sinceParam  ?? undefined,
          phone:  phoneParam  ?? undefined,
          tenantId: auth.tenantId,
        })
      );
      return NextResponse.json(orders, {
        headers: {
          "X-Total-Count":  String(total),
          "X-Limit":        String(limit),
          "X-Next-Cursor":  nextCursor ?? "",
        },
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ── Legacy: offset pagination (kept for backward compatibility) ───────────
    // Filters are pushed to the DB query (not in-memory) via getAllFiltered()
    let orders = await withDbRetry(() =>
      OrdersDB.getAllFiltered({
        status:  statusFilter  ?? undefined,
        since:   sinceParam    ?? undefined,
        phone:   phoneParam    ?? undefined,
        tenantId: auth.tenantId,
      })
    );

    const total = orders.length;

    if (limitParam) {
      const limit = Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 1000);
      const page  = Math.max(parseInt(pageParam ?? "1", 10) || 1, 1);
      const start = (page - 1) * limit;
      orders = orders.slice(start, start + limit);

      return NextResponse.json(orders, {
        headers: {
          "X-Total-Count": String(total),
          "X-Page": String(page),
          "X-Limit": String(limit),
          "X-Total-Pages": String(Math.ceil(total / limit)),
        },
      });
    }

    return NextResponse.json(orders, {
      headers: { "X-Total-Count": String(orders.length) },
    });
  } catch (e) {
    logger.error("[orders] GET error", { err: e instanceof Error ? e.message : String(e), requestId: req.headers.get("x-request-id") ?? undefined });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 orders per IP per 15 minutes (STRICT preset)
  const rateLimitResponse = applyRateLimit(req, "STRICT", "orders");
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // ── Idempotency: return existing order if same key is reused ────────────────
  const idempotencyKey = req.headers.get("x-idempotency-key")?.slice(0, 128) || undefined;
  if (idempotencyKey) {
    const existing = await prisma.order.findFirst({
      where: { idempotencyKey },
    }).catch(() => null);
    if (existing) {
      // Duplicate request — return the already-created order with 200
      return NextResponse.json(existing, { status: 200 });
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Tenant resolution & plan limit ──────────────────────────────────────────
  const rawTenantId = req.headers.get("x-tenant-id") ?? "main";
  const tenantId = (await resolveTenantSlug(rawTenantId)) ?? "main";

  // Fetch tenant plan and enforce maxOrdersPerMonth
  const tenantRow = await prisma.tenant.findFirst({ where: { OR: [{ id: tenantId }, { slug: tenantId }] }, select: { plan: true } });
  const limits = getPlanLimits(tenantRow?.plan ?? "free");
  if (!withinLimit(0, limits.maxOrdersPerMonth)) {
    // maxOrdersPerMonth === 0 means fully blocked (shouldn't happen in real configs)
    return NextResponse.json(planLimitPayload("pedidos/mes", limits.maxOrdersPerMonth, limits.maxOrdersPerMonth, tenantRow?.plan ?? "free"), { status: 402 });
  }
  if (limits.maxOrdersPerMonth !== -1) {
    const monthStart = new Date();
    monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
    // Cache the count for 5 minutes (300s) to avoid heavy DB queries on every order intent
    const monthCount = await getOrSet(
      `orders:count:${tenantId}:${monthStart.getTime()}`,
      300,
      async () => await prisma.order.count({ where: { tenantId, createdAt: { gte: monthStart } } })
    );
    if (!withinLimit(monthCount, limits.maxOrdersPerMonth)) {
      return NextResponse.json(
        planLimitPayload("pedidos/mes", monthCount, limits.maxOrdersPerMonth, tenantRow?.plan ?? "free"),
        { status: 402 },
      );
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  try {
    const raw = await req.json();
    const parsed = OrderPostSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }
    const body = parsed.data;

    // â”€â”€ Server-side total recomputation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Prevents price manipulation: always compute from item prices Ã— quantities
    const itemsTotal = body.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // Re-verify coupon server-side when code is present
    let serverCouponDiscount = 0;
    let verifiedCouponCode: string | undefined;
    if (body.appliedCouponCode) {
      const coupon = await CouponsDB.getByCode(body.appliedCouponCode);
      const now = new Date();
      const valid =
        coupon &&
        coupon.active &&
        (!coupon.expiresAt || new Date(coupon.expiresAt) > now) &&
        (!coupon.maxUses || coupon.usedCount < coupon.maxUses) &&
        (!coupon.minPurchase || itemsTotal >= coupon.minPurchase);
      if (valid) {
        if (coupon.discountType === "giftcard") {
          const balance = coupon.balance ?? coupon.discountValue;
          serverCouponDiscount = Math.min(balance, itemsTotal);
        } else {
          serverCouponDiscount =
            coupon.discountType === "percent"
              ? Math.round((itemsTotal * coupon.discountValue) / 100 * 100) / 100
              : Math.min(coupon.discountValue, itemsTotal);
        }
        verifiedCouponCode = coupon.code;
      }
    }

    // Server-verify promo: look up the actual promotion and compute discount from DB record
    let promoDiscount = 0;
    let verifiedPromoId: string | undefined;
    if (body.appliedPromoId) {
      const promo = await PromotionsDB.getAll(tenantId).then(all => all.find(p => p.id === body.appliedPromoId));
      const now = new Date();
      const promoValid =
        promo &&
        promo.active &&
        (!promo.expiresAt || new Date(promo.expiresAt) > now) &&
        (!promo.minPurchase || itemsTotal >= promo.minPurchase);
      if (promoValid) {
        promoDiscount = Math.round((itemsTotal * promo.discountPercent) / 100 * 100) / 100;
        verifiedPromoId = promo.id;
      }
    }

    // ── Strategy-based discounts (volume, loyalty, first purchase) ───────────
    // Uses the discount engine to compute the best automatic discount
    let engineDiscount = 0;
    let engineDiscountReason = "";
    const totalItemCount = body.items.reduce((sum, i) => sum + i.quantity, 0);
    const customerPhone = body.customer.phone;
    let customerTotalPurchases = 0;
    let isFirstPurchase = true;

    if (customerPhone) {
      customerTotalPurchases = await prisma.order.count({
        where: { tenantId, customerPhone },
      }).catch(() => 0);
      isFirstPurchase = customerTotalPurchases === 0;
    }

    const discountCtx: OrderContext = {
      subtotal: itemsTotal,
      itemCount: totalItemCount,
      customerTotalPurchases,
      isFirstPurchase,
    };
    const discountEngine = createDefaultDiscountEngine();
    const engineResult = discountEngine.apply(discountCtx);

    if (engineResult.bestDiscount && engineResult.bestDiscount.discountAmount > 0) {
      engineDiscount = engineResult.bestDiscount.discountAmount;
      engineDiscountReason = engineResult.bestDiscount.reason;
    }

    const computedTotal = Math.max(0, itemsTotal - serverCouponDiscount - promoDiscount - engineDiscount);
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    const now = new Date().toISOString();

    // Look up costPrice for each product to capture COGS at order time
    const productIds = body.items.map(i => i.id).filter(id => id > 0);
    const costMap = new Map<number, number>();
    if (productIds.length > 0) {
      const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, costPrice: true, price: true } });
      for (const p of products) costMap.set(p.id, p.costPrice ?? p.price * 0.7);
    }

    const orderItems = body.items.map(i => ({
      id: i.id,
      name: i.name,
      price: i.price,
      costPrice: costMap.get(i.id),
      quantity: i.quantity,
      unit: i.unit ?? "und",
      image: i.image ?? "",
    }));
    const totalCogs = orderItems.reduce((sum, i) => sum + (i.costPrice ?? i.price * 0.7) * i.quantity, 0);

    const order: DbOrder = {
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      customer: {
        name: body.customer.name,
        phone: body.customer.phone,
        location: body.customer.location ?? "",
        reference: body.customer.reference ?? "",
      },
      items: orderItems,
      totalCogs,
      total: computedTotal,
      status: "pendiente",
      paymentMethod: body.paymentMethod ?? "efectivo",
      notes: body.notes,
      deliverySlot: body.deliverySlot,
      yapeOperationNumber: body.yapeOperationNumber,
      deuda: body.deuda,
      ...(idempotencyKey && { idempotencyKey }),
      ...(verifiedCouponCode && {
        appliedCouponCode: verifiedCouponCode,
        couponDiscount: serverCouponDiscount,
      }),
      ...(promoDiscount > 0 && verifiedPromoId && {
        appliedPromoId: verifiedPromoId,
        discountAmount: promoDiscount,
      }),
      ...(engineDiscount > 0 && {
        autoDiscount: engineDiscount,
        autoDiscountReason: engineDiscountReason,
      }),
      createdAt: now,
      updatedAt: now,
    };
    const saved = await withDbRetry(() => OrdersDB.add(order, tenantId));

    // ── FEFO stock decrement: deduct from earliest-expiring batches first ────
    for (const item of body.items) {
      if (item.id > 0) {
        InventoryMovementsDB.decrementFEFO(item.id, item.quantity, saved.id, "venta_online").catch(() => {});
      }
    }
    // ─────────────────────────────────────────────────────────────────────────────

    // Increment coupon usage counter (fire-and-forget)
    if (verifiedCouponCode) {
      CouponsDB.redeem(verifiedCouponCode, serverCouponDiscount).catch(() => {});
    }
    // Fire-and-forget email notification (never blocks the response)
    sendOrderNotification({
      id: saved.id,
      customerName: saved.customer.name,
      customerPhone: saved.customer.phone,
      customerLocation: saved.customer.location ?? "",
      total: saved.total,
      paymentMethod: saved.paymentMethod,
      items: saved.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, unit: i.unit })),
      tenantId,
    }).catch(() => {});

    // Auto-send WhatsApp order received notification (fire-and-forget)
    if (saved.customer.phone) {
      // Check customer notification preferences
      const custPrefs = await prisma.customer.findUnique({
        where: { phone: saved.customer.phone },
        select: { notifOrderUpdates: true },
      }).catch(() => null);
      const wantsOrderNotifs = custPrefs?.notifOrderUpdates !== false;

      const orderInfo = {
        id: saved.id,
        customerName: saved.customer.name,
        customerPhone: saved.customer.phone,
        total: saved.total,
        status: "pendiente",
        paymentMethod: saved.paymentMethod,
        items: saved.items,
      };
      if (wantsOrderNotifs) {
        sendWhatsAppNotification(orderInfo).catch(() => {
          // API not configured — generate link for manual use (logged but not returned)
          getWhatsAppLink(orderInfo);
        });

        // Enviar recibo por WhatsApp solo si el cliente tiene alertasWhatsapp activo
        const custWa = await prisma.customer.findUnique({
          where: { phone: saved.customer.phone },
          select: { alertasWhatsapp: true },
        }).catch(() => null);
        if (custWa?.alertasWhatsapp !== false) {
          sendReceiptByWhatsApp(
            {
              id: saved.id,
              items: saved.items.map(i => ({ name: i.name, quantity: i.quantity, price: i.price, unit: i.unit })),
              total: saved.total,
              paymentMethod: saved.paymentMethod,
              createdAt: saved.createdAt,
            },
            saved.customer.phone,
            saved.customer.name,
          ).catch(() => {});
        }

        // Push notification for new order
        sendPushToPhone(saved.customer.phone, {
          title: "📋 ¡Pedido recibido!",
          body: `Tu pedido de S/${saved.total.toFixed(2)} fue recibido. Te avisamos cuando sea confirmado.`,
          url: `/pedido/${saved.id}`,
        }).catch(() => {});
      }
    }

    const requestId = req.headers.get("x-request-id") ?? undefined;
    logActivity("Crear", "pedido", `Nuevo pedido de ${saved.customer.name} por S/${saved.total.toFixed(2)}`, saved.id, "admin", requestId).catch(() => {});

    // Notify connected admin clients in real-time (fire-and-forget)
    emitAdminSSE("new_order", {
      id: saved.id,
      customer: saved.customer.name,
      total: saved.total,
      paymentMethod: saved.paymentMethod,
    });

    // ── Notify store OWNER/VENDOR via WhatsApp + Push (fire-and-forget) ────
    (async () => {
      try {
        const tenant = await prisma.tenant.findUnique({
          where: { slug: tenantId },
          select: { ownerPhone: true, name: true },
        });
        if (!tenant?.ownerPhone) return;
        const ownerPhone = tenant.ownerPhone;
        const itemsSummary = saved.items.slice(0, 5).map((i: { quantity: number; name: string }) => `${i.quantity}× ${i.name}`).join(", ");
        const moreItems = saved.items.length > 5 ? ` y ${saved.items.length - 5} más` : "";
        const vendorMsg = `🔔 *Nuevo pedido en ${tenant.name}*\n\n` +
          `👤 Cliente: ${saved.customer.name}\n` +
          `📦 Productos: ${itemsSummary}${moreItems}\n` +
          `💰 Total: S/${saved.total.toFixed(2)}\n` +
          `💳 Pago: ${saved.paymentMethod === "yape" ? "Yape" : saved.paymentMethod === "efectivo" ? "Efectivo" : saved.paymentMethod ?? "—"}\n\n` +
          `Revisa tu panel de administración para confirmar el pedido.`;
        sendWhatsAppText(ownerPhone, vendorMsg).catch(() => {});
        sendPushToPhone(ownerPhone, {
          title: `🔔 Nuevo pedido — S/${saved.total.toFixed(2)}`,
          body: `${saved.customer.name} hizo un pedido: ${itemsSummary}${moreItems}`,
          url: `/admin?tab=pedidos`,
        }).catch(() => {});
      } catch { /* non-critical — never block the response */ }
    })();
    // ───────────────────────────────────────────────────────────────────────

    // ── Loyalty milestone: auto-generate a reward coupon ───────────────────
    // Check every 5th completed order for the customer (5, 10, 15…)
    if (saved.customer.phone) {
      const customerPhone = saved.customer.phone; // narrow to string
      (async () => {
        try {
          // Count all orders by this phone via the JSON customer.phone field stored in OrdersDB
          const customerOrders = await OrdersDB.getByCustomerPhone(customerPhone);
          const orderCount = customerOrders.length;
          if (orderCount > 0 && orderCount % 5 === 0) {
            const discountPct = orderCount % 10 === 0 ? 15 : 10; // 15% on 10th, 20th…; 10% on 5th, 15th…
            const code = `FIEL${customerPhone.slice(-4)}${Date.now().toString(36).toUpperCase().slice(-4)}`;
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days
            await CouponsDB.add({
              code,
              description: `🎁 Premio fidelidad — pedido #${orderCount} de ${saved.customer.name}`,
              discountType: "percent",
              discountValue: discountPct,
              minPurchase: 10,
              maxUses: 1,
              active: true,
              expiresAt,
            });
            // Notify via push notification
            sendPushToPhone(customerPhone, {
              title: `🎁 ¡Premio de fidelidad!`,
              body: `Tienes un ${discountPct}% de descuento — usa el código ${code} en tu próximo pedido.`,
              url: "/",
            }).catch(() => {});
            // Log coupon creation
            logActivity("crear", "cupon", `Cupón de fidelidad ${code} (${discountPct}%) generado automáticamente para ${saved.customer.name} — pedido #${orderCount}`, code).catch(() => {});
          }
        } catch { /* non-critical — never block the response */ }
      })();
    }

    // Log customer notification for inbox
    if (saved.customer.phone) {
      prisma.customerNotification.create({
        data: {
          tenantId,
          customerPhone: saved.customer.phone,
          type: "order",
          title: "📋 Pedido recibido",
          body: `Tu pedido #${saved.id.slice(-6)} por S/${saved.total.toFixed(2)} fue recibido. Te avisaremos cuando sea confirmado.`,
          link: `/pedido/${saved.id}`,
        },
      }).catch(() => {});
    }

    return NextResponse.json(saved, { status: 201 });
  } catch (e) {
    logger.error("[orders] POST error", { err: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
