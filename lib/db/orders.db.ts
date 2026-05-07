import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrSet } from "@/lib/cache";
import { Prisma } from "@/lib/generated/prisma/client";
import type {
  Order as POrder,
  OrderItem as POrderItem,
  DeliverySlot as PDeliverySlot,
  Return as PReturn,
  ReturnItem as PReturnItem,
} from "@/lib/generated/prisma/client";
import {
  type DbOrder,
  type OrderStatus,
  normalizePhone,
} from "./misc.db";
import { toNumOrZero } from "@/lib/decimal-utils";
import { DomainEvents } from "@/lib/domain-events";
import { notifyOwnerNewOrder } from "@/lib/whatsapp-order-notify";
import { findTenantByIdOrSlug } from "@/lib/tenant";
import { checkAndIssueCoupons } from "@/lib/coupons/auto-coupon-triggers";
import { logger } from "@/lib/logger";

// ── Local Types ───────────────────────────────────────────────────────────────

export type DbDeliverySlot = {
  id: string;
  orderId: string;
  date: string;
  slot: string;
  notes?: string;
  createdAt: string;
};

export type DbReturnItem = {
  id: number;
  productId: number;
  name: string;
  quantity: number;
  price: number;
  unit: string;
};

export type DbReturn = {
  id: string;
  saleId?: string;
  orderId?: string;
  reason: string;
  total: number;
  photoUrl?: string;
  customerPhone?: string;
  creditApplied: boolean;
  items: DbReturnItem[];
  createdAt: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString();
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapOrder(o: POrder & { items: POrderItem[] }): DbOrder {
  return {
    id: o.id,
    customer: {
      name: o.customerName,
      ...(o.customerPhone && { phone: o.customerPhone }),
      location: o.customerLocation,
      reference: o.customerReference,
    },
    items: o.items.map((i: POrderItem) => ({ id: i.productId ?? 0, name: i.name, price: toNumOrZero(i.price), ...(i.costPrice != null && { costPrice: toNumOrZero(i.costPrice) }), quantity: i.quantity, unit: i.unit, image: i.image })),
    total: toNumOrZero(o.total),
    ...(o.totalCogs != null && { totalCogs: toNumOrZero(o.totalCogs) }),
    status: o.status as OrderStatus,
    ...(o.notes != null && { notes: o.notes }),
    ...(o.paymentMethod != null && { paymentMethod: o.paymentMethod as "yape" | "efectivo" }),
    ...(o.yapeOperationNumber != null && { yapeOperationNumber: o.yapeOperationNumber }),
    ...(o.deuda != null && { deuda: o.deuda }),
    ...(o.appliedCouponCode != null && { appliedCouponCode: o.appliedCouponCode }),
    ...(o.couponDiscount != null && { couponDiscount: toNumOrZero(o.couponDiscount) }),
    ...(o.appliedPromoId != null && { appliedPromoId: o.appliedPromoId }),
    ...(o.discountAmount != null && { discountAmount: toNumOrZero(o.discountAmount) }),
    ...((o as Record<string, unknown>).idempotencyKey != null && { idempotencyKey: (o as Record<string, unknown>).idempotencyKey as string }),
    ...((o as Record<string, unknown>).riderName != null && { riderName: (o as Record<string, unknown>).riderName as string }),
    ...((o as Record<string, unknown>).source != null && { source: (o as Record<string, unknown>).source as "direct" | "marketplace" | "wholesale" }),
    ...((o as Record<string, unknown>).deletedAt != null && { deletedAt: toISO((o as Record<string, unknown>).deletedAt as Date) }),
    createdAt: toISO(o.createdAt),
    updatedAt: toISO(o.updatedAt),
  };
}

function mapDeliverySlot(d: PDeliverySlot): DbDeliverySlot {
  return {
    id: d.id, orderId: d.orderId, date: d.date, slot: d.slot,
    ...(d.notes != null && { notes: d.notes }),
    createdAt: toISO(d.createdAt),
  };
}

function mapReturn(r: PReturn & { items: PReturnItem[] }): DbReturn {
  return {
    id: r.id,
    ...(r.saleId != null && { saleId: r.saleId }),
    ...(r.orderId != null && { orderId: r.orderId }),
    reason: r.reason, total: toNumOrZero(r.total),
    ...(r.photoUrl != null && { photoUrl: r.photoUrl }),
    ...(r.customerPhone != null && { customerPhone: r.customerPhone }),
    creditApplied: r.creditApplied ?? false,
    items: r.items.map((i: PReturnItem) => ({ id: i.id, productId: i.productId, name: i.name, quantity: i.quantity, price: toNumOrZero(i.price), unit: i.unit })),
    createdAt: toISO(r.createdAt),
  };
}

// ── Orders DB ─────────────────────────────────────────────────────────────────

export const OrdersDB = {
  async getAll(tenantId: string): Promise<DbOrder[]> {
    const where: Record<string, unknown> = { tenantId };
    return (await prisma.order.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" }, take: 1000 })).map(mapOrder);
  },

  /**
   * Fetch orders with optional DB-level filtering (no in-memory scan).
   * Use this instead of getAll() + array.filter() in the legacy GET path.
   */
  async getAllFiltered(opts?: {
    status?: string;
    since?: string;
    phone?: string;
    tenantId: string;
  }): Promise<DbOrder[]> {
    const where: Record<string, unknown> = {};
    if (opts?.tenantId) where.tenantId = opts.tenantId;
    if (opts?.status) {
      const statuses = opts.status.split(",").map((s) => s.trim());
      where.status = { in: statuses };
    }
    if (opts?.since) {
      const since = new Date(opts.since);
      if (!isNaN(since.getTime())) {
        where.createdAt = { gte: since };
      }
    }
    if (opts?.phone) {
      where.customerPhone = normalizePhone(opts.phone);
    }
    return (await prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
    })).map(mapOrder);
  },

  /**
   * Cursor-based pagination — efficient for large order volumes.
   * Returns up to `limit` orders plus the cursor for the next page.
   */
  async getPage(opts: {
    cursor?: string;
    limit?: number;
    status?: string;
    since?: string;
    phone?: string;
    tenantId: string;
  }): Promise<{ orders: DbOrder[]; nextCursor: string | null; total: number }> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

    // Build DB-level where clause (pushed to Postgres, no in-memory scan)
    const where: Record<string, unknown> = {};
    if (opts.tenantId) where.tenantId = opts.tenantId;
    if (opts.status) {
      const statuses = opts.status.split(",").map((s) => s.trim());
      where.status = { in: statuses };
    }
    if (opts.since) {
      const since = new Date(opts.since);
      if (!isNaN(since.getTime())) {
        where.createdAt = { gte: since };
      }
    }
    if (opts.phone) {
      where.customerPhone = normalizePhone(opts.phone);
    }

    const [rows, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      }),
      prisma.order.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? items[items.length - 1].id : null;

    return { orders: items.map(mapOrder), nextCursor, total };
  },

  /**
   * Fetch a single order scoped to the given tenant.
   * Returns null if the order does not exist OR belongs to a different tenant.
   * Do not distinguish the two cases to the caller — prevents oracle attacks.
   */
  async getById(tenantId: string, id: string): Promise<DbOrder | null> {
    const row = await prisma.order.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    return row ? mapOrder(row) : null;
  },
  /**
   * HOTFIX-005 / SN-1 — Fetch orders for a given phone, scoped to a tenant.
   *
   * Two call shapes are accepted during the migration window:
   *   - `(tenantId, phone)` — secure, tenant-scoped path. Use this everywhere.
   *   - `(phone)` — legacy, cross-tenant. @deprecated, do not use in new code.
   *     Still accepted so that app/api/orders/route.ts (Beta-Charlie's file,
   *     locked during this hotfix) keeps compiling until its call site is
   *     migrated in a follow-up PR. When `phone` is omitted the first arg is
   *     treated as the phone and NO tenant filter is applied.
   */
  async getByCustomerPhone(
    tenantIdOrPhone: string,
    phone?: string,
  ): Promise<DbOrder[]> {
    const where: Record<string, unknown> =
      phone !== undefined
        ? { tenantId: tenantIdOrPhone, customerPhone: normalizePhone(phone) }
        : { customerPhone: normalizePhone(tenantIdOrPhone) };
    return (await prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    })).map(mapOrder);
  },
  async add(order: DbOrder, tenantId: string): Promise<DbOrder> {
    // Ensure the customer exists in the DB before linking via FK
    const phone = order.customer.phone ? normalizePhone(order.customer.phone) : null;
    if (phone) {
      await prisma.customer.upsert({
        where: { phone },
        create: {
          phone,
          name: order.customer.name,
          location: order.customer.location ?? "",
          reference: order.customer.reference ?? "",
          tenantId,
        },
        update: {
          name: order.customer.name,
          location: order.customer.location ?? "",
          reference: order.customer.reference ?? "",
        },
      });
    }
    // Ensure all catalog products exist in the Product table so the FK constraint is
    // always satisfied. Store-catalog IDs come from data/products.ts and may differ
    // from the admin-managed DB product IDs.
    const uniqueIds = [...new Set(order.items.map((i) => i.id).filter((id) => id > 0))];
    if (uniqueIds.length > 0) {
      const existing = new Set(
        (await prisma.product.findMany({ where: { id: { in: uniqueIds } }, select: { id: true } }))
          .map((p) => p.id)
      );
      // N+1 fix: was N sequential $executeRaw INSERTs, now a single bulk insert.
      // De-dup by id so we don't try to insert the same stub twice.
      const seenStubIds = new Set<number>();
      const stubRows: Array<{ id: number; name: string; price: number; unit: string; image: string }> = [];
      for (const item of order.items) {
        if (item.id > 0 && !existing.has(item.id) && !seenStubIds.has(item.id)) {
          seenStubIds.add(item.id);
          stubRows.push({
            id:    item.id,
            name:  item.name,
            price: item.price,
            unit:  item.unit,
            image: item.image ?? "",
          });
        }
      }
      if (stubRows.length > 0) {
        const values = stubRows.map(
          (r) => Prisma.sql`(${r.id}, ${r.name}, 'tienda', ${r.price}, ${r.unit}, ${r.image})`
        );
        await prisma.$executeRaw`
          INSERT INTO "Product" (id, name, category, price, unit, image)
          VALUES ${Prisma.join(values)}
          ON CONFLICT (id) DO NOTHING
        `;
        // Keep the autoincrement sequence in sync so admin-created products get correct IDs
        await prisma.$executeRaw`SELECT setval(pg_get_serial_sequence('"Product"', 'id'), (SELECT MAX(id) FROM "Product"))`;
      }
    }
    const row = await prisma.order.create({
      data: {
        id: order.id,
        tenantId,
        customerName: order.customer.name,
        customerPhone: phone,
        customerLocation: order.customer.location ?? "",
        customerReference: order.customer.reference ?? "",
        total: order.total, totalCogs: order.totalCogs ?? null, status: order.status as never,
        notes: order.notes, paymentMethod: order.paymentMethod,
        yapeOperationNumber: order.yapeOperationNumber,
        deuda: order.deuda ?? null,
        appliedCouponCode: order.appliedCouponCode ?? null,
        couponDiscount: order.couponDiscount ?? null,
        appliedPromoId: order.appliedPromoId ?? null,
        discountAmount: order.discountAmount ?? null,
        items: {
          create: order.items.map((i) => ({
            productId: i.id > 0 ? i.id : null,
            name: i.name, price: i.price, costPrice: i.costPrice ?? null,
            quantity: i.quantity, unit: i.unit, image: i.image,
          })),
        },
      },
      include: { items: true },
    });
    // Persist idempotency key via raw SQL (field added in migration 20260316; types update after prisma generate)
    if (order.idempotencyKey) {
      await prisma.$executeRaw`UPDATE "Order" SET "idempotencyKey" = ${order.idempotencyKey} WHERE id = ${row.id}`.catch((err) => logger.error("[orders.db] persist idempotencyKey failed", { error: String(err), orderId: row.id }));
    }
    // Emit domain event — fire-and-forget, never breaks the happy path (see ADR 007)
    DomainEvents.ventaCompletada(tenantId, {
      orderId:       row.id,
      customerPhone: row.customerPhone ?? "",
      // TD-018: row.total es Decimal
      total:         toNumOrZero(row.total),
      itemCount:     order.items.length,
      paymentMethod: order.paymentMethod ?? "efectivo",
      hadCoupon:     Boolean(order.appliedCouponCode),
      isDelivery:    Boolean(order.customer.location),
    }).catch((err) => logger.error("[orders.db] DomainEvents.ventaCompletada failed", { error: String(err), orderId: row.id }));

    // Notify tenant owner via WhatsApp — fire-and-forget (Mejora #1)
    findTenantByIdOrSlug(tenantId)
      .then((tenant) => {
        if (!tenant) return;
        return notifyOwnerNewOrder(mapOrder(row), {
          id:         tenant.id,
          slug:       tenant.slug,
          name:       tenant.name,
          ownerPhone: tenant.ownerPhone,
        });
      })
      .catch((err) => logger.error("[orders.db] notifyOwnerNewOrder failed", { error: String(err), orderId: row.id }));

    // Rappi-style: crear primera oferta de delivery cuando hay ubicación.
    // Fire-and-forget — no bloquea la creación del pedido.
    // El cron delivery-offer-cascade se encargará de la cascada si nadie acepta.
    if (order.customer.location) {
      import("@/lib/delivery/offer-cascade")
        .then(({ createNextOffer }) => {
          // Pucallpa default — TODO geocode real cuando customer tenga lat/lng.
          const orderLat = -8.379;
          const orderLng = -74.553;
          return createNextOffer(
            { id: row.id, tenantId, customerLocation: row.customerLocation },
            orderLat,
            orderLng,
          );
        })
        .catch((err) => logger.error("[orders.db] delivery offer cascade failed", { error: String(err), orderId: row.id }));
    }

    // Auto-coupon triggers — fire-and-forget (Mejora #6)
    const mappedOrder = mapOrder(row);
    const customerForCoupons = row.customerPhone
      ? prisma.customer
          .findUnique({
            where: { phone: row.customerPhone },
            include: { locations: true },
          })
          .then((c) => {
            if (!c) return null;
            const toISO = (d: Date) => d.toISOString();
            return {
              phone:           c.phone,
              name:            c.name,
              location:        c.location,
              reference:       c.reference,
              locations:       c.locations.map((l) => ({ id: l.id, location: l.location, reference: l.reference })),
              activeLocationId: c.activeLocationId,
              birthday:        c.birthday ? toISO(c.birthday) : undefined,
              aiNotes:         c.aiNotes ?? undefined,
              aiNotesDate:     c.aiNotesDate ? toISO(c.aiNotesDate) : undefined,
              loyaltyPoints:   c.loyaltyPoints,
              loyaltyTier:     c.loyaltyTier,
              totalSpent:      toNumOrZero(c.totalSpent),
              privateNotes:    c.privateNotes ?? undefined,
              referralCode:    c.referralCode ?? undefined,
              referredBy:      c.referredBy ?? undefined,
              creditBalance:   toNumOrZero(c.creditBalance),
              creditLimit:     toNumOrZero(c.creditLimit),
              tags:            c.tags ?? null,
              lat:             c.lat ?? undefined,
              lng:             c.lng ?? undefined,
              notifOrderUpdates: c.notifOrderUpdates,
              notifPromotions:   c.notifPromotions,
              notifRestock:      c.notifRestock,
              createdAt:       toISO(c.createdAt),
              updatedAt:       toISO(c.updatedAt),
            };
          })
      : Promise.resolve(null);

    customerForCoupons
      .then((customer) => checkAndIssueCoupons(mappedOrder, customer, tenantId))
      .catch((err) => logger.error("[orders.db] checkAndIssueCoupons failed", { error: String(err), orderId: row.id }));

    return mappedOrder;
  },
  /**
   * Update an order scoped to the given tenant.
   * Returns null if the order does not exist OR belongs to a different tenant.
   */
  async update(tenantId: string, id: string, patch: Partial<DbOrder>): Promise<DbOrder | null> {
    // Tenant-scoped existence check — returns null for cross-tenant IDs
    const existing = await prisma.order.findFirst({ where: { id, tenantId } });
    if (!existing) return null;
    const data: Record<string, unknown> = {};
    if (patch.status) data.status = patch.status;
    if (patch.notes !== undefined) data.notes = patch.notes;
    if (patch.paymentMethod !== undefined) data.paymentMethod = patch.paymentMethod;
    if (patch.yapeOperationNumber !== undefined) data.yapeOperationNumber = patch.yapeOperationNumber;
    if (patch.deuda !== undefined) data.deuda = patch.deuda;
    if (patch.total !== undefined) data.total = patch.total;
    if (patch.riderName !== undefined) data.riderName = patch.riderName;
    if (patch.customer) {
      if (patch.customer.name) data.customerName = patch.customer.name;
      if (patch.customer.phone) data.customerPhone = normalizePhone(patch.customer.phone);
      if (patch.customer.location) data.customerLocation = patch.customer.location;
      if (patch.customer.reference) data.customerReference = patch.customer.reference;
    }
    const row = await prisma.order.update({ where: { id, tenantId }, data, include: { items: true } });
    return mapOrder(row);
  },
  /**
   * Delete an order scoped to the given tenant.
   * Silently no-ops when the order does not exist OR belongs to a different tenant.
   * Uses deleteMany (does not throw on zero matches) instead of delete.
   */
  async delete(tenantId: string, id: string): Promise<void> {
    await prisma.order.deleteMany({ where: { id, tenantId } }).catch((err) => logger.error("[orders.db] delete order failed", { error: String(err), orderId: id, tenantId }));
  },

  /**
   * Suma el total de órdenes entregadas entre dos fechas.
   * Usado por el dashboard del vendedor (KPI "ventas hoy/ayer/semana").
   */
  async getSalesTotal(tenantId: string, from: Date, to: Date): Promise<number> {
    const result = await prisma.order.aggregate({
      where: {
        tenantId,
        status: "entregado",
        createdAt: { gte: from, lte: to },
        deletedAt: null,
      },
      _sum: { total: true },
    });
    return toNumOrZero(result._sum.total);
  },

  /**
   * Cuenta los pedidos pendientes o confirmados (sin atender).
   */
  async countPending(tenantId: string): Promise<number> {
    return prisma.order.count({
      where: {
        tenantId,
        status: { in: ["pendiente", "confirmado"] },
        deletedAt: null,
      },
    });
  },

  /**
   * Obtiene los N pedidos pendientes/confirmados más recientes.
   */
  async getPending(tenantId: string, opts: { limit?: number } = {}): Promise<DbOrder[]> {
    const limit = Math.min(opts.limit ?? 5, 20);
    const rows = await prisma.order.findMany({
      where: {
        tenantId,
        status: { in: ["pendiente", "confirmado"] },
        deletedAt: null,
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(mapOrder);
  },

  /**
   * Obtiene las N ventas más recientes del día actual.
   */
  async getRecent(tenantId: string, opts: { limit?: number } = {}): Promise<DbOrder[]> {
    const limit = Math.min(opts.limit ?? 5, 20);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const rows = await prisma.order.findMany({
      where: {
        tenantId,
        createdAt: { gte: startOfToday },
        deletedAt: null,
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
    return rows.map(mapOrder);
  },

  /**
   * Devuelve el último pedido marketplace de un cliente (por teléfono),
   * junto con el storeSlug derivado del tenantId.
   * Cachea 60s por teléfono para evitar queries repetidas en reorders.
   */
  async getLastByCustomer(phone: string, tenantId?: string): Promise<{
    items: Array<{
      productId: number;
      name: string;
      quantity: number;
      price: number;
      unit: string;
      storeSlug: string;
    }>;
  } | null> {
    const normalized = normalizePhone(phone);
    // SECURITY 2026-05-06 (audit team H002): cache key incluye tenantId para
    // evitar leak entre tenants (mismo phone podría existir en varios tenants).
    const cacheKey = `orders:last-by-customer:${tenantId ?? "ANY"}:${normalized}`;

    return getOrSet(cacheKey, 60, async () => {
      const order = await prisma.order.findFirst({
        where: {
          customerPhone: normalized,
          source: "marketplace",
          deletedAt: null,
          // Scope tenant si se proveyó (call sites nuevos lo requieren).
          ...(tenantId ? { tenantId } : {}),
        },
        include: { items: true },
        orderBy: { createdAt: "desc" },
      });

      if (!order) return null;

      // Derive storeSlug from tenantId via Store table
      const store = await prisma.store.findFirst({
        where: { tenantId: order.tenantId },
        select: { slug: true },
      });
      const storeSlug = store?.slug ?? order.tenantId;

      return {
        items: order.items.map((i) => ({
          productId: i.productId ?? 0,
          name:      i.name,
          quantity:  i.quantity,
          price:     toNumOrZero(i.price),
          unit:      i.unit,
          storeSlug,
        })),
      };
    });
  },

  /**
   * Devuelve un array de 7 elementos con el ingreso (total entregado)
   * por cada uno de los últimos 7 días (del más antiguo al más reciente).
   */
  async getWeeklyRevenueBreakdown(tenantId: string): Promise<Array<{ date: string; total: number }>> {
    const results: Array<{ date: string; total: number }> = [];

    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);

      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);

      const agg = await prisma.order.aggregate({
        where: {
          tenantId,
          status: "entregado",
          createdAt: { gte: day, lt: nextDay },
          deletedAt: null,
        },
        _sum: { total: true },
      });

      results.push({
        date: day.toISOString().split("T")[0],
        total: toNumOrZero(agg._sum.total),
      });
    }

    return results;
  },
};

// ── Delivery Slots DB ─────────────────────────────────────────────────────────

export const DeliverySlotsDB = {
  async getByDate(tenantId: string, date: string): Promise<DbDeliverySlot[]> {
    return (await prisma.deliverySlot.findMany({ where: { tenantId, date }, orderBy: { createdAt: "asc" } })).map(mapDeliverySlot);
  },
  async getByOrderId(tenantId: string, orderId: string): Promise<DbDeliverySlot | null> {
    const row = await prisma.deliverySlot.findFirst({ where: { orderId, tenantId } });
    return row ? mapDeliverySlot(row) : null;
  },
  async set(data: { orderId: string; date: string; slot: string; notes?: string; tenantId: string }): Promise<DbDeliverySlot> {
    // Pre-check: refuse to attach a delivery slot to an order owned by another tenant.
    const order = await prisma.order.findFirst({ where: { id: data.orderId, tenantId: data.tenantId } });
    if (!order) {
      throw new Error(`[orders.db] DeliverySlotsDB.set: order ${data.orderId} not found for tenant ${data.tenantId}`);
    }
    const row = await prisma.deliverySlot.upsert({
      where: { orderId: data.orderId },
      create: { orderId: data.orderId, date: data.date, slot: data.slot, notes: data.notes, tenantId: data.tenantId },
      update: { date: data.date, slot: data.slot, notes: data.notes },
    });
    return mapDeliverySlot(row);
  },
};

// ── Returns DB ────────────────────────────────────────────────────────────────

export const ReturnsDB = {
  async getAll(tenantId: string): Promise<DbReturn[]> {
    const where: Record<string, unknown> = { tenantId };
    return (await prisma.return.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" } })).map(mapReturn);
  },
  async add(r: { saleId?: string; orderId?: string; reason: string; photoUrl?: string; customerPhone?: string; creditApplied?: boolean; items: Omit<DbReturnItem, "id">[]; tenantId: string }): Promise<DbReturn> {
    const total = r.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const row = await prisma.return.create({
      data: {
        saleId: r.saleId, orderId: r.orderId, reason: r.reason, total,
        photoUrl: r.photoUrl, customerPhone: r.customerPhone ? normalizePhone(r.customerPhone) : undefined,
        creditApplied: r.creditApplied ?? false,
        tenantId: r.tenantId,
        items: { create: r.items.map(i => ({ productId: i.productId, name: i.name, quantity: i.quantity, price: i.price, unit: i.unit })) },
      },
      include: { items: true },
    });
    return mapReturn(row);
  },
};
