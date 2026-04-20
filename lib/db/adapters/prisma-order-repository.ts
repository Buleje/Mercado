import "server-only";
// Adapter: implementa OrderRepository usando Prisma.
// NO toca lib/db/orders.db.ts — es un adapter nuevo e independiente.

import { prisma } from "@/lib/prisma";
import type { OrderRepository } from "@/domain/order/order-repository";
import { Order } from "@/domain/order/order";
import type { OrderItem } from "@/domain/order/order";
import { Money, OrderTotals } from "@/domain/order/value-objects";
import type { OrderStatus } from "@/domain/order/value-objects";
import type { OrderDto, OrderItemDto } from "@/domain/order/order-dto";
import type {
  Order as POrder,
  OrderItem as POrderItem,
  OrderStatus as POrderStatus,
} from "@/lib/generated/prisma/client";
import { toNumOrZero } from "@/lib/decimal-utils";

// ── Prisma OrderStatus → Domain OrderStatus ───────────────────────────────────

const PRISMA_TO_DOMAIN: Record<string, OrderStatus> = {
  pendiente:  "pending",
  confirmado: "paid",
  en_camino:  "paid",
  entregado:  "fulfilled",
  cancelado:  "cancelled",
};

const DOMAIN_TO_PRISMA: Record<OrderStatus, string> = {
  pending:   "pendiente",
  paid:      "confirmado",
  fulfilled: "entregado",
  cancelled: "cancelado",
};

// ── Mapper Prisma → Domain ────────────────────────────────────────────────────

function toDomain(row: POrder & { items: POrderItem[] }): Order {
  const currency = "PEN" as const;

  const items: OrderItem[] = row.items.map((i) => ({
    productId: i.productId ?? 0,
    name: i.name,
    price: Money.rehydrate(toNumOrZero(i.price), currency),
    quantity: i.quantity,
    unit: i.unit,
    image: i.image,
  }));

  const subtotalAmount = items.reduce((s, i) => s + i.price.amount * i.quantity, 0);
  const totalAmount    = toNumOrZero(row.total);
  const discountAmount = toNumOrZero(row.couponDiscount ?? 0) + toNumOrZero(row.discountAmount ?? 0);
  const shippingAmount = Math.max(0, totalAmount - subtotalAmount + discountAmount);

  const totals = OrderTotals.rehydrate({
    subtotal: Money.rehydrate(subtotalAmount, currency),
    shipping: Money.rehydrate(shippingAmount, currency),
    discount: Money.rehydrate(discountAmount, currency),
    total:    Money.rehydrate(totalAmount, currency),
  });

  const domainStatus: OrderStatus = PRISMA_TO_DOMAIN[row.status] ?? "pending";

  return Order.rehydrate({
    id:           row.id,
    tenantId:     row.tenantId,
    customerId:   row.customerPhone ?? "",
    items,
    totals,
    status:       domainStatus,
    cancelReason: (row as Record<string, unknown>).cancelReason as string | undefined,
    createdAt:    row.createdAt,
  });
}

// ── Mapper Domain → Prisma data ────────────────────────────────────────────────

function toPrismaData(order: Order): Record<string, unknown> {
  return {
    id:             order.id,
    tenantId:       order.tenantId,
    customerPhone:  order.customerId || null,
    customerName:   order.customerId,
    customerLocation: "",
    customerReference: "",
    total:          order.totals.total.amount,
    status:         DOMAIN_TO_PRISMA[order.status],
    cancelReason:   order.cancelReason ?? null,
    updatedAt:      new Date(),
  };
}

// ── Mapper Prisma → OrderDto (read model) ─────────────────────────────────────
// Separación CQRS-light: el DTO es vista rica para lectura, sin pasar por el
// dominio. Los campos extra (totalCogs, couponDiscount, source) NO son parte
// de las invariantes de Order, pero la UI los necesita.

function toDto(row: POrder & { items: POrderItem[] }): OrderDto {
  const items: OrderItemDto[] = row.items.map((i) => ({
    id: i.id,
    productId: i.productId ?? 0,
    name: i.name,
    price: toNumOrZero(i.price),
    quantity: i.quantity,
    unit: i.unit,
    image: i.image ?? null,
    costPrice: i.costPrice != null ? toNumOrZero(i.costPrice) : null,
  }));

  const extra = row as unknown as Record<string, unknown>;

  return {
    id:            row.id,
    tenantId:      row.tenantId,
    source:        (extra.source as string | undefined) ?? "marketplace",
    status:        row.status,
    customerPhone: row.customerPhone ?? null,
    customerName:  row.customerName,
    customerLocation:  row.customerLocation,
    customerReference: row.customerReference,
    total:          toNumOrZero(row.total),
    couponDiscount: row.couponDiscount != null ? toNumOrZero(row.couponDiscount) : null,
    discountAmount: row.discountAmount != null ? toNumOrZero(row.discountAmount) : null,
    totalCogs:      row.totalCogs      != null ? toNumOrZero(row.totalCogs)      : null,
    cancelReason:  (extra.cancelReason as string | null | undefined) ?? null,
    cancelledAt:   extra.cancelledAt instanceof Date ? extra.cancelledAt.toISOString() : null,
    createdAt:     row.createdAt.toISOString(),
    items,
  };
}

// ── PrismaOrderRepository ─────────────────────────────────────────────────────

export class PrismaOrderRepository implements OrderRepository {
  async findById(tenantId: string, id: string): Promise<Order | null> {
    const row = await prisma.order.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { items: true },
    });
    if (!row) return null;
    return toDomain(row);
  }

  // Read-side (CQRS-light): devuelve DTO rico sin pasar por el dominio.
  // Pensado para endpoints GET que serializan a JSON.
  async findByIdDto(
    tenantId: string,
    id: string,
    opts?: { source?: string },
  ): Promise<OrderDto | null> {
    const row = await prisma.order.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
        ...(opts?.source ? { source: opts.source } : {}),
      },
      include: { items: true },
    });
    if (!row) return null;
    return toDto(row);
  }

  async save(order: Order): Promise<void> {
    const data = toPrismaData(order);

    await prisma.order.upsert({
      where: { id: order.id },
      update: {
        status:      data.status as POrderStatus,
        cancelReason: data.cancelReason as string | null,
        updatedAt:   data.updatedAt as Date,
      },
      create: {
        id:                data.id as string,
        tenantId:          data.tenantId as string,
        customerPhone:     data.customerPhone as string | null,
        customerName:      data.customerName as string,
        customerLocation:  data.customerLocation as string,
        customerReference: data.customerReference as string,
        total:             data.total as number,
        status:            data.status as POrderStatus,
      },
    });
  }

  async findByTenant(
    tenantId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<Order[]> {
    const rows = await prisma.order.findMany({
      where: { tenantId, deletedAt: null },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take:   opts?.limit  ?? 50,
      skip:   opts?.offset ?? 0,
    });
    return rows.map(toDomain);
  }
}
