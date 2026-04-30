import { NextResponse } from "next/server";
import { z } from "zod";
import { OrdersDB, CouponsDB, PromotionsDB } from "@/lib/jsondb";
import type { DbOrder } from "@/lib/jsondb";
import { emitAdminSSE } from "@/lib/sse-emitter";
import { toNumOrZero } from "@/lib/decimal-utils";
import { sendOrderNotification } from "@/lib/mailer";
import { sendWhatsAppNotification, getWhatsAppLink, sendWhatsAppQueued } from "@/lib/whatsapp";
import { sendReceiptByWhatsApp } from "@/lib/receipt-whatsapp";
import { sendPushToPhone } from "@/lib/push-sender";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { requireAdmin } from "@/lib/require-admin";
import { requireActiveSubscription } from "@/lib/billing/require-active-subscription";
import { withDbRetry } from "@/lib/db-retry";
import { applyRateLimit } from "@/lib/rate-limit";
import { prismaForTenant } from "@/lib/tenant";
import { InventoryMovementsDB } from "@/lib/db/inventory.db";
import { resolveTenantSlug, resolveTenantSlugToId } from "@/lib/resolve-tenant";
import { getPlanLimits, withinLimit, planLimitPayload } from "@/lib/plans";
import { getOrSet } from "@/lib/cache";
import { createDefaultDiscountEngine } from "@/lib/pricing/discount-strategies";
import type { OrderContext } from "@/lib/pricing/discount-strategies";
import { withApiHandler } from "@/lib/api-handler";

const OrderItemModifierSchema = z.object({
  groupId: z.string().min(1).max(50),
  optionId: z.string().min(1).max(50),
});

const OrderItemSchema = z.object({
  id: z.number(),
  name: z.string().min(1).max(200),
  price: z.number().min(0),
  quantity: z.number().min(1),
  unit: z.string().max(30).optional(),
  image: z.string().max(500).optional(),
  category: z.string().optional(),
  badge: z.string().nullable().optional(),
  /** Modifiers elegidos por el cliente — server re-valida y recomputa price. */
  modifiers: z.array(OrderItemModifierSchema).max(40).optional(),
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

export const GET = withApiHandler("orders-list", async (req) => {
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");      // e.g. "pendiente"
  const limitParam   = searchParams.get("limit");       // default: all
  const pageParam    = searchParams.get("page");        // offset pagination page
  const cursorParam  = searchParams.get("cursor");      // cursor-based pagination
  const sinceParam   = searchParams.get("since");       // ISO date string
  const phoneParam   = searchParams.get("phone");       // filter by customer phone

  // ── Public branch: storefront customer reading own orders by phone ────────
  // SECURITY (HOTFIX-A2, 2026-04-29): exige customer-session firmada cuyo
  // customerId coincida con el phone solicitado. Antes solo había rate limit
  // (vector cosecha PII). Ahora rate limit MODERATE + auth obligatoria.
  // Sin session → respuesta vacía para preservar UX anónima.
  let tenantId: string;
  if (phoneParam) {
    const rl = applyRateLimit(req, "MODERATE", "orders-get-public");
    if (rl) return rl;

    // Customer-session check (defensa principal — sustituye a rate-only).
    const { getCustomerPayload, CUSTOMER_SESSION } = await import("@/lib/auth/customer-session");
    const { normalizePhone } = await import("@/lib/db/misc.db");
    const sessionToken = req.cookies.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
    let authorized = false;
    if (sessionToken) {
      const payload = await getCustomerPayload(sessionToken);
      if (payload?.customerId && normalizePhone(payload.customerId) === normalizePhone(phoneParam)) {
        authorized = true;
      }
    }
    if (!authorized) {
      return NextResponse.json([]);
    }

    const rawTenantId = req.headers.get("x-tenant-id") ?? "main";
    const slugOrId = (await resolveTenantSlug(rawTenantId)) ?? "main";
    tenantId = await resolveTenantSlugToId(slugOrId);
    const publicLimit = limitParam
      ? Math.min(Math.max(parseInt(limitParam, 10) || 50, 1), 50)
      : 50;
    const { orders, nextCursor, total } = await withDbRetry(() =>
      OrdersDB.getPage({
        cursor: cursorParam ?? undefined,
        limit: publicLimit,
        status: statusFilter ?? undefined,
        since:  sinceParam  ?? undefined,
        phone:  phoneParam,
        tenantId,
      })
    );
    return NextResponse.json(orders, {
      headers: {
        "X-Total-Count":  String(total),
        "X-Limit":        String(publicLimit),
        "X-Next-Cursor":  nextCursor ?? "",
      },
    });
  }
  // ─────────────────────────────────────────────────────────────────────────

  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  const rl = applyRateLimit(req, "GENEROUS", "orders-get");
  if (rl) return rl;
  tenantId = auth.tenantId;

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
        tenantId,
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
      tenantId,
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
});

export const POST = withApiHandler("orders-create", async (req) => {
  // Rate limit: 5 orders per IP per 15 minutes (STRICT preset)
  const rateLimitResponse = applyRateLimit(req, "STRICT", "orders");
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  // ── Tenant resolution ───────────────────────────────────────────────────────
  // HOTFIX-004: must run BEFORE the idempotency lookup so the key is scoped
  // by tenant — otherwise tenant B can replay tenant A's key and leak the order.
  const rawTenantId = req.headers.get("x-tenant-id") ?? "main";
  const slugOrId = (await resolveTenantSlug(rawTenantId)) ?? "main";
  const tenantId = await resolveTenantSlugToId(slugOrId);

  // ── Trial expiry guard (ADR-084) ────────────────────────────────────────────
  // Tienda con trial vencido sin plan pagado → no se aceptan pedidos.
  // Defense-in-depth: el storefront ya redirige a "tienda no disponible",
  // pero acá bloqueamos requests directos a la API.
  const trialBlocked = await requireActiveSubscription(tenantId);
  if (trialBlocked) return trialBlocked;

  // ── Idempotency: return existing order if same key is reused ────────────────
  // HOTFIX-004: scoped by tenantId — two tenants can use the same key safely.
  // HOTFIX-M2 (2026-04-29): scoped tambien por phone (cuando viene en body)
  // para evitar que dos clientes del MISMO tenant con mismo idempotency key
  // (ej. UUID fijado por bug en SDK) colisionen y un cliente reciba la orden
  // de otro. Si no hay phone en body, fallback al check legacy (solo tenantId).
  const idempotencyKey = req.headers.get("x-idempotency-key")?.slice(0, 128) || undefined;
  // Peek body sin consumir — body se vuelve a leer abajo. Clonamos req.
  let phoneFromBody: string | undefined;
  if (idempotencyKey) {
    try {
      const peek = await req.clone().json();
      const ph = peek?.customer?.phone;
      if (typeof ph === "string" && ph.length >= 6) phoneFromBody = ph.replace(/\D/g, "");
    } catch { /* body invalido — el zod parse abajo lo rechaza */ }
  }
  if (idempotencyKey) {
    const existing = await prismaForTenant(tenantId).order.findFirst({
      where: phoneFromBody
        ? { idempotencyKey, tenantId, customerPhone: phoneFromBody }
        : { idempotencyKey, tenantId },
    }).catch((err) => { logger.error("[orders] operation failed", { error: String(err), tenantId }); return null; });
    if (existing) {
      // Duplicate request — return the already-created order with 200
      return NextResponse.json(existing, { status: 200 });
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // Fetch tenant plan and enforce maxOrdersPerMonth
  const tenantRow = await prismaForTenant(tenantId).tenant.findFirst({ where: { OR: [{ id: tenantId }, { slug: tenantId }] }, select: { plan: true } });
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
      async () => await prismaForTenant(tenantId).order.count({ where: { tenantId, createdAt: { gte: monthStart } } })
    );
    if (!withinLimit(monthCount, limits.maxOrdersPerMonth)) {
      return NextResponse.json(
        planLimitPayload("pedidos/mes", monthCount, limits.maxOrdersPerMonth, tenantRow?.plan ?? "free"),
        { status: 402 },
      );
    }
  }
  // ─────────────────────────────────────────────────────────────────────────────

  const raw = await req.json();
  const parsed = OrderPostSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos inválidos", issues: parsed.error.issues.map((i) => i.message) },
      { status: 400 }
    );
  }
  const body = parsed.data;

    // ── HOTFIX-001: Server-authoritative pricing ────────────────────────────
    // NEVER trust body.items[i].price — attacker can send price=0.01 and have
    // the server persist the manipulated total. Resolve the selling price AND
    // the COGS straight from the DB, scoped by tenantId so items from another
    // tenant are rejected. Reject any order whose productId is deleted,
    // cross-tenant or outright fake.
    const productIds = body.items.map(i => i.id);
    const serverPriceMap = new Map<number, number>();
    const costMap = new Map<number, number>();
    // RED-005: track which products have finite stock so the atomic decrement
    // below skips unlimited (stock IS NULL) products without false-rejecting.
    const stockMap = new Map<number, number | null>();
    if (productIds.length > 0) {
      const products = await prismaForTenant(tenantId).product.findMany({
        where: { tenantId, id: { in: productIds } },
        select: { id: true, price: true, costPrice: true, stock: true },
      });
      for (const p of products) {
        const priceNum = toNumOrZero(p.price);
        const costNum = toNumOrZero(p.costPrice);
        serverPriceMap.set(p.id, priceNum);
        costMap.set(p.id, costNum || priceNum * 0.7);
        stockMap.set(p.id, p.stock ?? null);
      }
    }
    for (const i of body.items) {
      if (!serverPriceMap.has(i.id)) {
        return NextResponse.json(
          { error: "invalid_product", productId: i.id },
          { status: 400 },
        );
      }
    }

    // ── Modifiers: re-validar server-side y mapear priceDelta ──────────────
    // El cliente envia { groupId, optionId } solamente; el server fetcha la
    // opcion desde DB scoped por tenantId y recomputa el priceDelta autoritativo.
    const allOptionIds = body.items.flatMap(
      (i) => i.modifiers?.map((m) => m.optionId) ?? [],
    );
    const optionMap = new Map<
      string,
      { id: string; name: string; groupId: string; priceDelta: number }
    >();
    if (allOptionIds.length > 0) {
      const { ProductModifiersDB } = await import("@/lib/db/product-modifiers.db");
      const opts = await ProductModifiersDB.getOptionsByIds(tenantId, allOptionIds);
      for (const o of opts) {
        optionMap.set(o.id, {
          id: o.id,
          name: o.name,
          groupId: o.groupId,
          priceDelta: o.priceDelta,
        });
      }
    }
    // Group meta lookup para snapshot
    const groupNameMap = new Map<string, string>();
    if (allOptionIds.length > 0) {
      const groupIds = Array.from(
        new Set(Array.from(optionMap.values()).map((o) => o.groupId)),
      );
      if (groupIds.length > 0) {
        const groups = await prismaForTenant(tenantId).productModifierGroup.findMany({
          where: { tenantId, id: { in: groupIds } },
          select: { id: true, name: true },
        });
        for (const g of groups) groupNameMap.set(g.id, g.name);
      }
    }
    // Calcular priceDelta por item (suma de modifiers validos)
    const itemPriceDeltaMap = new Map<number, number>();
    const itemModifierSnapshotMap = new Map<
      number,
      Array<{
        groupId: string;
        groupName: string;
        optionId: string;
        optionName: string;
        priceDelta: number;
      }>
    >();
    for (let idx = 0; idx < body.items.length; idx++) {
      const item = body.items[idx];
      const mods = item.modifiers ?? [];
      let delta = 0;
      const snapshot: Array<{
        groupId: string;
        groupName: string;
        optionId: string;
        optionName: string;
        priceDelta: number;
      }> = [];
      for (const m of mods) {
        const opt = optionMap.get(m.optionId);
        if (!opt) {
          return NextResponse.json(
            { error: "invalid_modifier", optionId: m.optionId },
            { status: 400 },
          );
        }
        delta += opt.priceDelta;
        snapshot.push({
          groupId: opt.groupId,
          groupName: groupNameMap.get(opt.groupId) ?? "",
          optionId: opt.id,
          optionName: opt.name,
          priceDelta: opt.priceDelta,
        });
      }
      itemPriceDeltaMap.set(idx, delta);
      if (snapshot.length > 0) itemModifierSnapshotMap.set(idx, snapshot);
    }

    // ── Server-side total recomputation ─────────────────────────────────────
    // Always computed from DB prices × quantities — never from the client.
    // Now includes priceDelta from validated modifiers.
    const itemsTotal = body.items.reduce(
      (sum, i, idx) =>
        sum +
        ((serverPriceMap.get(i.id) ?? 0) + (itemPriceDeltaMap.get(idx) ?? 0)) *
          i.quantity,
      0,
    );

    // Re-verify coupon server-side when code is present
    let serverCouponDiscount = 0;
    let verifiedCouponCode: string | undefined;
    if (body.appliedCouponCode) {
      // RED-007: tenant-scoped lookup — tenant B can NOT use a coupon owned
      // by tenant A. Lookup will return null when tenantId doesn't match.
      const coupon = await CouponsDB.getByCode(tenantId, body.appliedCouponCode);
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
      customerTotalPurchases = await prismaForTenant(tenantId).order.count({
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

    // Telemetria de fraud attempts: si el cliente envia un total que no cuadra
    // con el recomputo del servidor (> 1 centavo de diferencia), registrar warn
    // con request_id para Sentry. NO rechazamos — HOTFIX-001 ya persiste el
    // total del servidor. Esto solo agrega observabilidad.
    const clientTotal = typeof body.total === "number" ? body.total : null;
    if (clientTotal !== null && Math.abs(clientTotal - computedTotal) > 0.01) {
      const fraudContext = {
        clientTotal,
        computedTotal,
        delta: Math.round((clientTotal - computedTotal) * 100) / 100,
        tenantId,
        requestId: req.headers.get("x-request-id") ?? undefined,
      };
      logger.warn("[orders/create] client/server total mismatch", fraudContext);
      Sentry.captureMessage("Fraud attempt: order total mismatch", {
        level: "warning",
        tags: { fraud_attempt: "true", tenant: tenantId },
        extra: fraudContext,
      });
    }
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    const now = new Date().toISOString();

    // HOTFIX-001: price comes from serverPriceMap (DB), NOT body.items[i].price.
    // costMap was already populated above from the same authoritative query.
    // priceDelta de modifiers se suma al unit price autoritativo.
    const orderItems = body.items.map((i, idx) => {
      const basePrice = serverPriceMap.get(i.id) ?? 0;
      const delta = itemPriceDeltaMap.get(idx) ?? 0;
      const modifiersSnapshot = itemModifierSnapshotMap.get(idx);
      return {
        id: i.id,
        name: i.name,
        price: basePrice + delta,
        costPrice: costMap.get(i.id),
        quantity: i.quantity,
        unit: i.unit ?? "und",
        image: i.image ?? "",
        modifiers: modifiersSnapshot,
      };
    });
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
    // ── RED-005 + RED-006: atomic stock decrement + coupon redeem ───────────
    // Race window: two parallel POSTs for the last unit. Without an atomic
    // conditional UPDATE, both reads see stock=1 and both succeed. Same race
    // applies to maxUses=1 coupons. Solution: a single prisma.$transaction
    // that runs row-level conditional UPDATEs server-side in PostgreSQL.
    // Either every guard wins or every write rolls back.
    const NOW_FOR_TXN = new Date();
    try {
      await prismaForTenant(tenantId).$transaction(async (tx) => {
        // Stock: one conditional UPDATE per item, only for products with
        // finite stock. Items with stock=null are unlimited and skipped.
        for (const item of body.items) {
          if (item.id <= 0) continue; // skip free-form / non-DB items
          const tracked = stockMap.get(item.id);
          if (tracked == null) continue; // unlimited stock — no decrement needed
          const affected: number = await tx.$executeRaw`
            UPDATE "Product"
               SET "stock" = "stock" - ${item.quantity}
             WHERE "id" = ${item.id}
               AND "tenantId" = ${tenantId}
               AND "stock" IS NOT NULL
               AND "stock" >= ${item.quantity}
          `;
          if (affected === 0) {
            // Throwing inside the txn callback rolls back every prior write.
            const err = new Error("insufficient_stock") as Error & {
              code?: string;
              productId?: number;
              productName?: string;
            };
            err.code = "INSUFFICIENT_STOCK";
            err.productId = item.id;
            err.productName = item.name;
            throw err;
          }
        }

        // Coupon: same atomic conditional UPDATE pattern, scoped by tenant.
        // The maxUses guard runs in SQL — two parallel callers cannot both
        // bump usedCount past the limit.
        if (verifiedCouponCode) {
          const couponAffected: number = await tx.$executeRaw`
            UPDATE "Coupon"
               SET "usedCount" = "usedCount" + 1
             WHERE "code" = ${verifiedCouponCode}
               AND "tenantId" = ${tenantId}
               AND "active" = true
               AND ("expiresAt" IS NULL OR "expiresAt" > ${NOW_FOR_TXN})
               AND ("maxUses" IS NULL OR "usedCount" < "maxUses")
          `;
          if (couponAffected === 0) {
            const err = new Error("coupon_exhausted") as Error & { code?: string };
            err.code = "COUPON_EXHAUSTED";
            throw err;
          }
        }
      });
    } catch (txErr) {
      const code = (txErr as { code?: string }).code;
      if (code === "INSUFFICIENT_STOCK") {
        const e = txErr as Error & { productId?: number; productName?: string };
        return NextResponse.json(
          {
            error: "insufficient_stock",
            productId: e.productId,
            productName: e.productName,
          },
          { status: 409 },
        );
      }
      if (code === "COUPON_EXHAUSTED") {
        return NextResponse.json(
          { error: "coupon_exhausted", couponCode: verifiedCouponCode },
          { status: 409 },
        );
      }
      throw txErr;
    }
    // ─────────────────────────────────────────────────────────────────────────

    let saved: DbOrder;
    try {
      saved = await withDbRetry(() => OrdersDB.add(order, tenantId));
    } catch (addErr) {
      // Compensating writes — the atomic guards above already decremented
      // stock and bumped coupon usage, but the order row never landed. Roll
      // those side-effects back so we don't leak inventory or coupon uses.
      // Best-effort, fire-and-forget per CLAUDE.md #7.
      (async () => {
        try {
          await prismaForTenant(tenantId).$transaction(async (tx) => {
            for (const item of body.items) {
              if (item.id <= 0) continue;
              if (stockMap.get(item.id) == null) continue;
              await tx.$executeRaw`
                UPDATE "Product"
                   SET "stock" = "stock" + ${item.quantity}
                 WHERE "id" = ${item.id}
                   AND "tenantId" = ${tenantId}
                   AND "stock" IS NOT NULL
              `;
            }
            if (verifiedCouponCode) {
              await tx.$executeRaw`
                UPDATE "Coupon"
                   SET "usedCount" = GREATEST("usedCount" - 1, 0)
                 WHERE "code" = ${verifiedCouponCode}
                   AND "tenantId" = ${tenantId}
              `;
            }
          });
        } catch { /* swallow — log path is best-effort */ }
      })().catch((err) => logger.error("[orders] operation failed", { error: String(err), tenantId }));
      throw addErr;
    }

    // ── FEFO batch decrement (separate from Product.stock — deducts from
    //    earliest-expiring Batch rows). Fire-and-forget per CLAUDE.md #7.
    for (const item of body.items) {
      if (item.id > 0) {
        InventoryMovementsDB.decrementFEFO(item.id, item.quantity, tenantId, saved.id, "venta_online").catch((err) => logger.error("[orders] inventory FEFO decrement failed", { error: String(err), tenantId }));
      }
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
    }).catch((err) => logger.error("[orders] operation failed", { error: String(err), tenantId }));

    // Auto-send WhatsApp order received notification (fire-and-forget)
    if (saved.customer.phone) {
      // Check customer notification preferences
      const custPrefs = await prismaForTenant(tenantId).customer.findUnique({
        where: { phone: saved.customer.phone },
        select: { notifOrderUpdates: true },
      }).catch((err) => { logger.error("[orders] operation failed", { error: String(err), tenantId }); return null; });
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
        const custWa = await prismaForTenant(tenantId).customer.findUnique({
          where: { phone: saved.customer.phone },
          select: { alertasWhatsapp: true },
        }).catch((err) => { logger.error("[orders] operation failed", { error: String(err), tenantId }); return null; });
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
          ).catch((err) => logger.error("[orders] operation failed", { error: String(err), tenantId }));
        }

        // Push notification for new order
        sendPushToPhone(saved.customer.phone, {
          title: "📋 ¡Pedido recibido!",
          body: `Tu pedido de S/${saved.total.toFixed(2)} fue recibido. Te avisamos cuando sea confirmado.`,
          url: `/pedido/${saved.id}`,
        }).catch((err) => logger.error("[orders] operation failed", { error: String(err), tenantId }));
      }
    }

    const requestId = req.headers.get("x-request-id") ?? undefined;
    logActivity("Crear", "pedido", `Nuevo pedido de ${saved.customer.name} por S/${saved.total.toFixed(2)}`, saved.id, "admin", requestId).catch((err) => logger.error("[orders] activity log failed", { error: String(err), tenantId }));

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
        const tenant = await prismaForTenant(tenantId).tenant.findUnique({
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
        sendWhatsAppQueued(ownerPhone, vendorMsg, { tenantId, context: "order-vendor-notify" }).catch((err) => logger.error("[orders] vendor notify failed", { error: String(err), tenantId }));
        sendPushToPhone(ownerPhone, {
          title: `🔔 Nuevo pedido — S/${saved.total.toFixed(2)}`,
          body: `${saved.customer.name} hizo un pedido: ${itemsSummary}${moreItems}`,
          url: `/admin?tab=pedidos`,
        }).catch((err) => logger.error("[orders] operation failed", { error: String(err), tenantId }));
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
          // Wave 4 F-1: tenant-scoped lookup — prevents cross-tenant loyalty counter leakage
          const customerOrders = await OrdersDB.getByCustomerPhone(tenantId, customerPhone);
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
            }, tenantId);
            // Notify via push notification
            sendPushToPhone(customerPhone, {
              title: `🎁 ¡Premio de fidelidad!`,
              body: `Tienes un ${discountPct}% de descuento — usa el código ${code} en tu próximo pedido.`,
              url: "/",
            }).catch((err) => logger.error("[orders] operation failed", { error: String(err), tenantId }));
            // Log coupon creation
            logActivity("crear", "cupon", `Cupón de fidelidad ${code} (${discountPct}%) generado automáticamente para ${saved.customer.name} — pedido #${orderCount}`, code).catch((err) => logger.error("[orders] activity log failed", { error: String(err), tenantId }));
          }
        } catch { /* non-critical — never block the response */ }
      })();
    }

    // Log customer notification for inbox
    if (saved.customer.phone) {
      prismaForTenant(tenantId).customerNotification.create({
        data: {
          tenantId,
          customerPhone: saved.customer.phone,
          type: "order",
          title: "📋 Pedido recibido",
          body: `Tu pedido #${saved.id.slice(-6)} por S/${saved.total.toFixed(2)} fue recibido. Te avisaremos cuando sea confirmado.`,
          link: `/pedido/${saved.id}`,
        },
      }).catch((err) => logger.error("[orders] operation failed", { error: String(err), tenantId }));
    }

    return NextResponse.json(saved, { status: 201 });
});
