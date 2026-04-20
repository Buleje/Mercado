// Entidad Order — pura, sin Prisma, sin cache, sin server-only.
// Inmutable: cada mutacion retorna una nueva instancia via Result<Order, OrderError>.

import type { Result } from "../shared/result";
import { ok, err } from "../shared/result";
import type { OrderError } from "../shared/errors";
import {
  type OrderStatus,
  type Currency,
  Money,
  OrderTotals,
  canTransitionTo,
} from "./value-objects";

// ── OrderItem ─────────────────────────────────────────────────────────────────

export interface OrderItem {
  readonly productId: number;
  readonly name: string;
  readonly price: Money;
  readonly quantity: number;
  readonly unit: string;
  readonly image: string;
}

// ── NewOrderInput ─────────────────────────────────────────────────────────────

export interface NewOrderInput {
  id: string;
  tenantId: string;
  customerId: string;
  items: readonly OrderItem[];
  totals: OrderTotals;
  currency: Currency;
  createdAt?: Date;
}

// ── OrderProps (para rehydrate) ───────────────────────────────────────────────

export interface OrderProps {
  id: string;
  tenantId: string;
  customerId: string;
  items: readonly OrderItem[];
  totals: OrderTotals;
  status: OrderStatus;
  cancelReason?: string;
  paidAt?: Date;
  createdAt: Date;
}

// ── Order entity ──────────────────────────────────────────────────────────────

export class Order {
  private constructor(
    public readonly id: string,
    public readonly tenantId: string,
    public readonly customerId: string,
    public readonly items: readonly OrderItem[],
    public readonly totals: OrderTotals,
    public readonly status: OrderStatus,
    public readonly cancelReason: string | undefined,
    public readonly paidAt: Date | undefined,
    public readonly createdAt: Date,
  ) {}

  // ── Factory: nuevo pedido ────────────────────────────────────────────────────

  static create(input: NewOrderInput): Result<Order, OrderError> {
    if (input.items.length === 0) {
      return err({
        kind: "MISSING_ITEMS",
        message: "An order must have at least one item",
      });
    }

    // Todos los items deben usar la misma moneda
    for (const item of input.items) {
      if (item.price.currency !== input.currency) {
        return err({
          kind: "MIXED_CURRENCY",
          message: `Item "${item.name}" uses ${item.price.currency} but order currency is ${input.currency}`,
          expected: input.currency,
          received: item.price.currency,
        });
      }
      if (item.quantity <= 0) {
        return err({
          kind: "NEGATIVE_QUANTITY",
          message: `Item "${item.name}" has non-positive quantity: ${item.quantity}`,
          quantity: item.quantity,
        });
      }
    }

    return ok(
      new Order(
        input.id,
        input.tenantId,
        input.customerId,
        input.items,
        input.totals,
        "pending",
        undefined,
        undefined,
        input.createdAt ?? new Date(),
      ),
    );
  }

  // ── Factory: reconstruir desde persistencia ──────────────────────────────────

  static rehydrate(props: OrderProps): Order {
    return new Order(
      props.id,
      props.tenantId,
      props.customerId,
      props.items,
      props.totals,
      props.status,
      props.cancelReason,
      props.paidAt,
      props.createdAt,
    );
  }

  // ── Transitions ──────────────────────────────────────────────────────────────

  canTransitionTo(to: OrderStatus): boolean {
    return canTransitionTo(this.status, to);
  }

  markPaid(paidAt: Date): Result<Order, OrderError> {
    if (!this.canTransitionTo("paid")) {
      return err({
        kind: "INVALID_ORDER_STATE",
        message: `Cannot mark as paid from status "${this.status}"`,
        from: this.status,
        to: "paid",
      });
    }
    return ok(
      new Order(
        this.id,
        this.tenantId,
        this.customerId,
        this.items,
        this.totals,
        "paid",
        this.cancelReason,
        paidAt,
        this.createdAt,
      ),
    );
  }

  cancel(reason: string): Result<Order, OrderError> {
    if (!this.canTransitionTo("cancelled")) {
      return err({
        kind: "INVALID_ORDER_STATE",
        message: `Cannot cancel from status "${this.status}"`,
        from: this.status,
        to: "cancelled",
      });
    }
    return ok(
      new Order(
        this.id,
        this.tenantId,
        this.customerId,
        this.items,
        this.totals,
        "cancelled",
        reason,
        this.paidAt,
        this.createdAt,
      ),
    );
  }

  fulfill(): Result<Order, OrderError> {
    if (!this.canTransitionTo("fulfilled")) {
      return err({
        kind: "INVALID_ORDER_STATE",
        message: `Cannot fulfill from status "${this.status}"`,
        from: this.status,
        to: "fulfilled",
      });
    }
    return ok(
      new Order(
        this.id,
        this.tenantId,
        this.customerId,
        this.items,
        this.totals,
        "fulfilled",
        this.cancelReason,
        this.paidAt,
        this.createdAt,
      ),
    );
  }

  // ── Mutations (retornan nueva instancia) ──────────────────────────────────────

  addItem(item: OrderItem): Result<Order, OrderError> {
    if (item.quantity <= 0) {
      return err({
        kind: "NEGATIVE_QUANTITY",
        message: `Cannot add item "${item.name}" with quantity ${item.quantity}`,
        quantity: item.quantity,
      });
    }

    // Inferir currency desde totals
    const orderCurrency = this.totals.total.currency;
    if (item.price.currency !== orderCurrency) {
      return err({
        kind: "MIXED_CURRENCY",
        message: `Item "${item.name}" uses ${item.price.currency} but order uses ${orderCurrency}`,
        expected: orderCurrency,
        received: item.price.currency,
      });
    }

    if (this.status !== "pending") {
      return err({
        kind: "INVALID_ORDER_STATE",
        message: `Cannot add items to an order with status "${this.status}"`,
        from: this.status,
        to: this.status,
      });
    }

    const newItems = [...this.items, item];
    // Recalcular subtotal sumando precio * cantidad
    const newSubtotalAmount = newItems.reduce(
      (sum, i) => sum + i.price.amount * i.quantity,
      0,
    );
    const newSubtotal = Money.rehydrate(newSubtotalAmount, orderCurrency);
    const newTotal = Money.rehydrate(
      newSubtotalAmount + this.totals.shipping.amount - this.totals.discount.amount,
      orderCurrency,
    );
    const newTotals = OrderTotals.rehydrate({
      subtotal: newSubtotal,
      shipping: this.totals.shipping,
      discount: this.totals.discount,
      total: newTotal,
    });

    return ok(
      new Order(
        this.id,
        this.tenantId,
        this.customerId,
        newItems,
        newTotals,
        this.status,
        this.cancelReason,
        this.paidAt,
        this.createdAt,
      ),
    );
  }
}
