// Entidad Product — pura, sin Prisma, sin cache, sin server-only.
// Inmutable: mutaciones retornan nueva instancia via Result<Product, ProductError>.

import type { Result } from "../shared/result";
import { ok, err } from "../shared/result";
import type { ProductError } from "../shared/errors";
import { Money } from "../order/value-objects";
import type { Currency } from "../order/value-objects";

// ── NewProductInput ───────────────────────────────────────────────────────────

export interface NewProductInput {
  id: number;
  tenantId: string;
  name: string;
  category: string;
  price: Money;
  costPrice?: Money;
  unit: string;
  image: string;
  description?: string;
  badge?: string;
  barcode?: string;
  stock?: number;
  active?: boolean;
}

// ── ProductProps (para rehydrate) ─────────────────────────────────────────────

export interface ProductProps {
  id: number;
  tenantId: string;
  name: string;
  category: string;
  price: Money;
  costPrice?: Money;
  unit: string;
  image: string;
  description?: string;
  badge?: string;
  barcode?: string;
  stock?: number;
  active: boolean;
}

// ── Product entity ────────────────────────────────────────────────────────────

export class Product {
  private constructor(
    public readonly id: number,
    public readonly tenantId: string,
    public readonly name: string,
    public readonly category: string,
    public readonly price: Money,
    public readonly costPrice: Money | undefined,
    public readonly unit: string,
    public readonly image: string,
    public readonly description: string | undefined,
    public readonly badge: string | undefined,
    public readonly barcode: string | undefined,
    public readonly stock: number | undefined,
    public readonly active: boolean,
  ) {}

  // ── Factory: nuevo producto ──────────────────────────────────────────────────

  static create(input: NewProductInput): Result<Product, ProductError> {
    if (!input.name.trim()) {
      return err({
        kind: "INVALID_PRODUCT",
        message: "Product name cannot be empty",
        field: "name",
      });
    }
    if (!input.category.trim()) {
      return err({
        kind: "INVALID_PRODUCT",
        message: "Product category cannot be empty",
        field: "category",
      });
    }
    if (input.price.amount < 0) {
      return err({
        kind: "INVALID_MONEY",
        message: `Price cannot be negative: ${input.price.amount}`,
        amount: input.price.amount,
      });
    }
    if (input.stock !== undefined && input.stock < 0) {
      return err({
        kind: "NEGATIVE_QUANTITY",
        message: `Stock cannot be negative: ${input.stock}`,
        quantity: input.stock,
      });
    }

    return ok(
      new Product(
        input.id,
        input.tenantId,
        input.name.trim(),
        input.category.trim(),
        input.price,
        input.costPrice,
        input.unit,
        input.image,
        input.description,
        input.badge,
        input.barcode,
        input.stock,
        input.active ?? true,
      ),
    );
  }

  // ── Factory: reconstruir desde persistencia ──────────────────────────────────

  static rehydrate(props: ProductProps): Product {
    return new Product(
      props.id,
      props.tenantId,
      props.name,
      props.category,
      props.price,
      props.costPrice,
      props.unit,
      props.image,
      props.description,
      props.badge,
      props.barcode,
      props.stock,
      props.active,
    );
  }

  // ── Mutations ────────────────────────────────────────────────────────────────

  updatePrice(newPrice: Money): Result<Product, ProductError> {
    if (newPrice.amount < 0) {
      return err({
        kind: "INVALID_MONEY",
        message: `Price cannot be negative: ${newPrice.amount}`,
        amount: newPrice.amount,
      });
    }
    return ok(
      new Product(
        this.id, this.tenantId, this.name, this.category,
        newPrice, this.costPrice, this.unit, this.image,
        this.description, this.badge, this.barcode, this.stock, this.active,
      ),
    );
  }

  adjustStock(delta: number): Result<Product, ProductError> {
    const current = this.stock ?? 0;
    const next = current + delta;
    if (next < 0) {
      return err({
        kind: "NEGATIVE_QUANTITY",
        message: `Stock would go negative: ${current} + ${delta} = ${next}`,
        quantity: next,
      });
    }
    return ok(
      new Product(
        this.id, this.tenantId, this.name, this.category,
        this.price, this.costPrice, this.unit, this.image,
        this.description, this.badge, this.barcode, next, this.active,
      ),
    );
  }

  deactivate(): Product {
    return new Product(
      this.id, this.tenantId, this.name, this.category,
      this.price, this.costPrice, this.unit, this.image,
      this.description, this.badge, this.barcode, this.stock, false,
    );
  }

  /** Margen bruto sobre precio de costo. Retorna undefined si no hay costPrice. */
  grossMarginPercent(): number | undefined {
    if (!this.costPrice || this.costPrice.amount === 0) return undefined;
    return ((this.price.amount - this.costPrice.amount) / this.costPrice.amount) * 100;
  }

  /** Helper: crear Money en la moneda del producto. */
  static money(amount: number, currency: Currency): Result<Money, ProductError> {
    const result = Money.create(amount, currency);
    if (!result.ok) {
      return err({
        kind: "INVALID_MONEY",
        message: result.error.message,
        amount,
      });
    }
    return ok(result.value);
  }
}
