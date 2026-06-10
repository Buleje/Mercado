import "server-only";
import { prisma } from "@/lib/prisma";
// TD-116 (2026-06-10): lecturas envueltas en withRlsTx — RLS server-side
// cuando la app conecte como buleje_app (hoy postgres bypasea; inocuo).
import { withRlsTx } from "@/lib/prisma-rls";
import { getOrSet, invalidate } from "@/lib/cache";
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
  /**
   * Retorna OrderItems de los productIds dados, para el cálculo EOQ.
   * El guard multi-tenant va anidado en order (OrderItem no tiene tenantId
   * propio — el filtro real es por la entidad padre Order).
   *
   * tenantId SIEMPRE 1er parámetro.
   */
  async findOrderItemsByProducts(
    tenantId: string,
    productIds: (number | string)[],
    since: Date,
  ) {
    return withRlsTx(tenantId, (tx) => tx.orderItem.findMany({
      where: {
        productId: { in: productIds as number[] },
        order: { tenantId, createdAt: { gte: since }, status: { not: "cancelado" as never } },
      },
      select: { productId: true, quantity: true },
    }));
  },

  /**
   * Retorna los orders creados después de `since` para el SSE de
   * notificaciones del admin. Hasta 5 resultados, ordenados desc.
   *
   * tenantId SIEMPRE 1er parámetro.
   */
  async findRecentForStream(tenantId: string, since: Date) {
    return withRlsTx(tenantId, (tx) => tx.order.findMany({
      where: {
        tenantId,
        createdAt: { gt: since },
      },
      select: {
        id: true,
        customerName: true,
        total: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }));
  },

  async getAll(tenantId: string): Promise<DbOrder[]> {
    const where: Record<string, unknown> = { tenantId };
    return (await withRlsTx(tenantId, (tx) => tx.order.findMany({ where, include: { items: true }, orderBy: { createdAt: "desc" }, take: 1000 }))).map(mapOrder);
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
    limit?: number;
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
    return (await withRlsTx(opts!.tenantId, (tx) => tx.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: opts?.limit ?? 5000,
    }))).map(mapOrder);
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

    // TD-116: batch-tx → Promise.all dentro de la tx interactiva de withRlsTx
    // (mismo snapshot de conexión; una tx anidada no está permitida en Prisma).
    const [rows, total] = await withRlsTx(opts.tenantId, (tx) =>
      Promise.all([
        tx.order.findMany({
          where,
          include: { items: true },
          orderBy: { createdAt: "desc" },
          take: limit + 1,
          ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
        }),
        tx.order.count({ where }),
      ]),
    );

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
    const row = await withRlsTx(tenantId, (tx) => tx.order.findFirst({
      where: { id, tenantId },
      include: { items: true },
    }));
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
    // TD-116: solo el shape scoped lleva RLS; el legacy (sin tenant) es
    // cross-tenant por diseño @deprecated y quedará bloqueado en fase contract.
    const query = (c: typeof prisma) => c.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });
    const rows = phone !== undefined
      ? await withRlsTx(tenantIdOrPhone, (tx) => query(tx as unknown as typeof prisma))
      : await query(prisma);
    return rows.map(mapOrder);
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
    // PERF 2026-05-24: invalidar el lookup "última orden del customer" — sin
    // esto, tras comprar el storefront muestra el pedido anterior hasta 60s.
    // `phone` ya viene normalizado (línea ~249); mismo cacheKey que
    // getLastOrderByCustomer (línea ~576).
    if (phone) invalidate(`orders:last-by-customer:${tenantId}:${phone}`);
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
    const result = await withRlsTx(tenantId, (tx) => tx.order.aggregate({
      where: {
        tenantId,
        status: "entregado",
        createdAt: { gte: from, lte: to },
        deletedAt: null,
      },
      _sum: { total: true },
    }));
    return toNumOrZero(result._sum.total);
  },

  /**
   * Cuenta los pedidos pendientes o confirmados (sin atender).
   */
  async countPending(tenantId: string): Promise<number> {
    return withRlsTx(tenantId, (tx) => tx.order.count({
      where: {
        tenantId,
        status: { in: ["pendiente", "confirmado"] },
        deletedAt: null,
      },
    }));
  },

  /**
   * Cuenta pedidos ENTREGADOS de un cliente filtrado por origen.
   *
   * Audit project-wide 2026-05-19 (CodeReview P0 #1): migracion del
   * prisma.order.count directo en /api/marketplace/loyalty/summary
   * a esta funcion canonica (CLAUDE.md regla #1).
   *
   * source: "marketplace" para tier marketplace cross-store, omit para
   * todos los origenes (ADR-082).
   */
  async countDeliveredByPhone(
    tenantId: string,
    phone: string,
    opts: { source?: string } = {},
  ): Promise<number> {
    return withRlsTx(tenantId, (tx) => tx.order.count({
      where: {
        tenantId,
        customerPhone: phone,
        status: "entregado",
        deletedAt: null,
        ...(opts.source ? { source: opts.source } : {}),
      },
    }));
  },

  /**
   * Obtiene los N pedidos pendientes/confirmados más recientes.
   */
  async getPending(tenantId: string, opts: { limit?: number } = {}): Promise<DbOrder[]> {
    const limit = Math.min(opts.limit ?? 5, 20);
    const rows = await withRlsTx(tenantId, (tx) => tx.order.findMany({
      where: {
        tenantId,
        status: { in: ["pendiente", "confirmado"] },
        deletedAt: null,
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    }));
    return rows.map(mapOrder);
  },

  /**
   * Obtiene las N ventas más recientes del día actual.
   */
  async getRecent(tenantId: string, opts: { limit?: number } = {}): Promise<DbOrder[]> {
    const limit = Math.min(opts.limit ?? 5, 20);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const rows = await withRlsTx(tenantId, (tx) => tx.order.findMany({
      where: {
        tenantId,
        createdAt: { gte: startOfToday },
        deletedAt: null,
      },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    }));
    return rows.map(mapOrder);
  },

  /**
   * Devuelve el último pedido marketplace de un cliente (por teléfono),
   * junto con el storeSlug derivado del tenantId.
   * Cachea 60s por teléfono para evitar queries repetidas en reorders.
   *
   * audit P0 Cal #2 (Brandon 2026-05-18): `tenantId` ahora es required.
   * Antes era opcional con fallback "ANY" cross-tenant — un call site
   * que olvidara pasar tenantId leía órdenes de cualquier tenant con
   * ese phone. Único caller `/api/marketplace/reorder/last` ya pasa
   * `session.tenantId`, sin cambio de comportamiento real.
   */
  async getLastByCustomer(tenantId: string, phone: string): Promise<{
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
    const cacheKey = `orders:last-by-customer:${tenantId}:${normalized}`;

    return getOrSet(cacheKey, 60, async () => {
      // TD-116: ambas queries en una sola tx RLS (Store no tiene policy; inocuo)
      const { order, store } = await withRlsTx(tenantId, async (tx) => {
        const o = await tx.order.findFirst({
          where: {
            customerPhone: normalized,
            source: "marketplace",
            deletedAt: null,
            tenantId,
          },
          include: { items: true },
          orderBy: { createdAt: "desc" },
        });
        if (!o) return { order: null, store: null };
        // Derive storeSlug from tenantId via Store table
        const s = await tx.store.findFirst({
          where: { tenantId: o.tenantId },
          select: { slug: true },
        });
        return { order: o, store: s };
      });

      if (!order) return null;
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
   *
   * audit P0 Cal #1 (Brandon 2026-05-18): antes 7 await aggregates
   * secuenciales en un for-loop (7 RTT). Ahora Promise.all paraleliza
   * los 7 → 1 RTT efectivo. KPI del dashboard tenant carga 6× más rápido
   * en tenants con historial alto.
   */
  // TD-116: NO envuelto en withRlsTx a propósito — los 7 aggregates corren en
  // Promise.all paralelo (perf 6×, audit Cal #1); una tx interactiva los
  // serializaría en una conexión. Cubierto por where.tenantId; RLS llegará
  // vía fase contract.
  async getWeeklyRevenueBreakdown(tenantId: string): Promise<Array<{ date: string; total: number }>> {
    const days: Array<{ day: Date; nextDay: Date }> = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      days.push({ day, nextDay });
    }

    const aggs = await Promise.all(
      days.map(({ day, nextDay }) =>
        prisma.order.aggregate({
          where: {
            tenantId,
            status: "entregado",
            createdAt: { gte: day, lt: nextDay },
            deletedAt: null,
          },
          _sum: { total: true },
        }),
      ),
    );

    return days.map(({ day }, idx) => ({
      date: day.toISOString().split("T")[0],
      total: toNumOrZero(aggs[idx]._sum.total),
    }));
  },

  /**
   * Audit P0 Cal #3 (2026-05-18): helper para migrar el último
   * `prisma.orderStatusHistory.create` directo en `[id]/route.ts`.
   * Fire-and-forget (el caller decide si await o catch).
   */
  async addStatusHistory(
    tenantId: string,
    payload: {
      orderId: string;
      fromStatus: string;
      toStatus: string;
      changedBy: string;
      note?: string | null;
    },
  ): Promise<void> {
    await prisma.orderStatusHistory.create({
      data: {
        tenantId,
        orderId: payload.orderId,
        fromStatus: payload.fromStatus as never,
        toStatus: payload.toStatus as never,
        changedBy: payload.changedBy,
        note: payload.note ?? null,
      },
    });
  },

  /**
   * Audit P0 Cal #3: helper para leer items de una orden con categoría
   * (usado por auto-earn de loyalty). Reemplaza el `prisma.orderItem.findMany`
   * inline de `[id]/route.ts`. tenantId scoping vía orderId-en-orden-del-tenant.
   */
  async getItemsForLoyalty(
    tenantId: string,
    orderId: string,
  ): Promise<Array<{ price: number; quantity: number; category: string | null }>> {
    const items = await withRlsTx(tenantId, (tx) => tx.orderItem.findMany({
      where: { orderId, order: { tenantId } },
      select: {
        price: true,
        quantity: true,
        product: { select: { category: true } },
      },
    }));
    return items.map((oi) => ({
      price: toNumOrZero(oi.price),
      quantity: oi.quantity,
      category: oi.product?.category ?? null,
    }));
  },

  /**
   * Lista ordenes (con items) de un rango de fechas. Variante CROSS-TENANT
   * para crons de plataforma (daily-digest). Caller debe filtrar por
   * tenantId si necesita scope.
   *
   * @cross-tenant intentional — cron platform-wide (ADR-082).
   * Audit project-wide 2026-05-19 — migracion de /api/daily-digest.
   */
  async listAllInDateRange(
    from: Date,
    to: Date,
  ): Promise<Array<DbOrder>> {
    const rows = await prisma.order.findMany({
      where: { createdAt: { gte: from, lt: to } },
      include: { items: true },
    });
    return rows.map(mapOrder);
  },

  /**
   * Items para guia de remision (name, quantity, unit, productId).
   * Guard cross-tenant via order.tenantId nested.
   *
   * Audit project-wide 2026-05-19 — migracion de /api/guias-remision.
   */
  async getItemsForGuiaRemision(
    tenantId: string,
    orderId: string,
  ): Promise<Array<{ name: string; quantity: number; unit: string | null; productId: number | null }>> {
    return withRlsTx(tenantId, (tx) => tx.orderItem.findMany({
      where: { orderId, order: { tenantId } },
      select: { name: true, quantity: true, unit: true, productId: true },
    }));
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
