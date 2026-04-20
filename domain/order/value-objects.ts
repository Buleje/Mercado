// Value Objects para Order — inmutables, validados, sin Prisma, sin DB.

import type { Result } from "../shared/result";
import { ok, err } from "../shared/result";
import type { InvalidMoneyError, MixedCurrencyError, InvalidTotalsError } from "../shared/errors";

// ── Currency ──────────────────────────────────────────────────────────────────

export type Currency = "PEN" | "USD";

// ── OrderStatus state machine ─────────────────────────────────────────────────
//
// Transiciones permitidas:
//   pending  → paid | cancelled
//   paid     → fulfilled | cancelled
//   fulfilled → (terminal)
//   cancelled → (terminal)

export type OrderStatus = "pending" | "paid" | "fulfilled" | "cancelled";

const ALLOWED_TRANSITIONS: Record<OrderStatus, ReadonlyArray<OrderStatus>> = {
  pending:   ["paid", "cancelled"],
  paid:      ["fulfilled", "cancelled"],
  fulfilled: [],
  cancelled: [],
};

export function canTransitionTo(from: OrderStatus, to: OrderStatus): boolean {
  return (ALLOWED_TRANSITIONS[from] as ReadonlyArray<string>).includes(to);
}

// ── Money ─────────────────────────────────────────────────────────────────────

export class Money {
  private constructor(
    public readonly amount: number,
    public readonly currency: Currency,
  ) {}

  static create(
    amount: number,
    currency: Currency,
  ): Result<Money, InvalidMoneyError> {
    if (!Number.isFinite(amount) || amount < 0) {
      return err({
        kind: "INVALID_MONEY",
        message: `Money amount must be a finite non-negative number, got ${amount}`,
        amount,
      });
    }
    return ok(new Money(amount, currency));
  }

  /** Construir sin validacion — solo para rehydratar desde persistencia confiable. */
  static rehydrate(amount: number, currency: Currency): Money {
    return new Money(amount, currency);
  }

  add(other: Money): Result<Money, MixedCurrencyError> {
    if (this.currency !== other.currency) {
      return err({
        kind: "MIXED_CURRENCY",
        message: `Cannot add ${this.currency} and ${other.currency}`,
        expected: this.currency,
        received: other.currency,
      });
    }
    return ok(new Money(this.amount + other.amount, this.currency));
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount === other.amount;
  }

  toString(): string {
    return `${this.currency} ${this.amount.toFixed(2)}`;
  }
}

// ── OrderTotals ───────────────────────────────────────────────────────────────

export interface OrderTotalsProps {
  subtotal: Money;
  shipping: Money;
  discount: Money;
  total: Money;
}

export class OrderTotals {
  private constructor(
    public readonly subtotal: Money,
    public readonly shipping: Money,
    public readonly discount: Money,
    public readonly total: Money,
  ) {}

  /**
   * Invariante: total = subtotal + shipping - discount
   * Tolerancia de 1 centavo para floating point.
   */
  static create(props: OrderTotalsProps): Result<OrderTotals, InvalidTotalsError> {
    const currencies = [props.subtotal.currency, props.shipping.currency, props.discount.currency, props.total.currency];
    const allSame = currencies.every((c) => c === currencies[0]);
    if (!allSame) {
      return err({
        kind: "INVALID_TOTALS",
        message: "All Money values in OrderTotals must share the same currency",
        expected: 0,
        received: 0,
      });
    }

    const expected = props.subtotal.amount + props.shipping.amount - props.discount.amount;
    const diff = Math.abs(expected - props.total.amount);
    if (diff > 0.01) {
      return err({
        kind: "INVALID_TOTALS",
        message: `Total mismatch: subtotal(${props.subtotal.amount}) + shipping(${props.shipping.amount}) - discount(${props.discount.amount}) = ${expected}, but total = ${props.total.amount}`,
        expected,
        received: props.total.amount,
      });
    }

    return ok(new OrderTotals(props.subtotal, props.shipping, props.discount, props.total));
  }

  /** Rehydratar desde persistencia confiable — sin re-validar invariante. */
  static rehydrate(props: OrderTotalsProps): OrderTotals {
    return new OrderTotals(props.subtotal, props.shipping, props.discount, props.total);
  }
}
