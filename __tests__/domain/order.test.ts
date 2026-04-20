// Tests de dominio — SIN DB, SIN Prisma, SIN server-only.
// Prueba de fuego: si algún import del módulo domain/ incluye "server-only", estos tests fallan.

import { describe, it, expect } from "vitest";
import { Order } from "@/domain/order/order";
import type { OrderItem } from "@/domain/order/order";
import { Money, OrderTotals, canTransitionTo } from "@/domain/order/value-objects";
// OrderTotals se usa directamente en el test de quantity negativa
import type { OrderStatus } from "@/domain/order/value-objects";

// ── Helpers de test ───────────────────────────────────────────────────────────

function makeMoney(amount: number) {
  const r = Money.create(amount, "PEN");
  if (!r.ok) throw new Error(`makeMoney failed: ${r.error.message}`);
  return r.value;
}

function makeTotals(subtotal: number, shipping: number, discount: number) {
  const result = OrderTotals.create({
    subtotal: makeMoney(subtotal),
    shipping: makeMoney(shipping),
    discount: makeMoney(discount),
    total:    makeMoney(subtotal + shipping - discount),
  });
  if (!result.ok) throw new Error(`makeTotals failed: ${result.error.message}`);
  return result.value;
}

function makeItem(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    productId: 1,
    name:      "Arroz 1kg",
    price:     makeMoney(5.5),
    quantity:  2,
    unit:      "bolsa",
    image:     "",
    ...overrides,
  };
}

function makeOrder(itemOverrides: Partial<OrderItem>[] = [{}]) {
  const items = itemOverrides.map(makeItem);
  const subtotal = items.reduce((s, i) => s + i.price.amount * i.quantity, 0);
  return Order.create({
    id:         "order-001",
    tenantId:   "tenant-abc",
    customerId: "+51999000001",
    items,
    totals:     makeTotals(subtotal, 2, 0),
    currency:   "PEN",
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Order.create", () => {
  it("crea una orden valida con estado 'pending'", () => {
    const result = makeOrder();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("pending");
  });

  it("rechaza orden sin items", () => {
    const result = Order.create({
      id:         "order-002",
      tenantId:   "tenant-abc",
      customerId: "+51999000001",
      items:      [],
      totals:     makeTotals(0, 0, 0),
      currency:   "PEN",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("MISSING_ITEMS");
  });

  it("rechaza item con quantity <= 0", () => {
    const result = makeOrder([{ quantity: 0 }]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("NEGATIVE_QUANTITY");
  });

  it("rechaza item con quantity negativa", () => {
    // Construimos el item manualmente para evitar que makeTotals calcule subtotal negativo
    const item: OrderItem = {
      productId: 1,
      name: "Arroz 1kg",
      price: Money.rehydrate(5.5, "PEN"),
      quantity: -1,
      unit: "bolsa",
      image: "",
    };
    const result = Order.create({
      id:         "order-neg-qty",
      tenantId:   "tenant-abc",
      customerId: "+51999000001",
      items:      [item],
      totals:     OrderTotals.rehydrate({
        subtotal: Money.rehydrate(0, "PEN"),
        shipping: Money.rehydrate(0, "PEN"),
        discount: Money.rehydrate(0, "PEN"),
        total:    Money.rehydrate(0, "PEN"),
      }),
      currency: "PEN",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("NEGATIVE_QUANTITY");
  });

  it("rechaza items con currency diferente a la orden", () => {
    const usdItem = makeItem({ price: Money.rehydrate(5, "USD") });
    const result = Order.create({
      id:         "order-003",
      tenantId:   "tenant-abc",
      customerId: "+51999000001",
      items:      [usdItem],
      totals:     makeTotals(5, 0, 0),
      currency:   "PEN",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("MIXED_CURRENCY");
  });
});

describe("OrderTotals.create", () => {
  it("rechaza cuando total != subtotal + shipping - discount", () => {
    const result = OrderTotals.create({
      subtotal: makeMoney(10),
      shipping: makeMoney(2),
      discount: makeMoney(0),
      total:    makeMoney(99), // incorrecto
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("INVALID_TOTALS");
  });

  it("acepta totals con discount aplicado correctamente", () => {
    const result = OrderTotals.create({
      subtotal: makeMoney(20),
      shipping: makeMoney(5),
      discount: makeMoney(3),
      total:    makeMoney(22), // 20 + 5 - 3 = 22
    });
    expect(result.ok).toBe(true);
  });
});

describe("Order.addItem", () => {
  it("retorna una NUEVA instancia (inmutabilidad)", () => {
    const createResult = makeOrder();
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const original = createResult.value;
    const newItem  = makeItem({ productId: 2, name: "Azucar 1kg", quantity: 1 });
    const addResult = original.addItem(newItem);

    expect(addResult.ok).toBe(true);
    if (!addResult.ok) return;

    // Son instancias distintas
    expect(addResult.value).not.toBe(original);
    // Original no muto
    expect(original.items.length).toBe(1);
    expect(addResult.value.items.length).toBe(2);
  });

  it("rechaza item con quantity cero", () => {
    const createResult = makeOrder();
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const result = createResult.value.addItem(makeItem({ quantity: 0 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("NEGATIVE_QUANTITY");
  });

  it("rechaza item con currency diferente", () => {
    const createResult = makeOrder();
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const usdItem = makeItem({ price: Money.rehydrate(5, "USD") });
    const result  = createResult.value.addItem(usdItem);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("MIXED_CURRENCY");
  });

  it("actualiza totals al agregar item", () => {
    const createResult = makeOrder([{ quantity: 2, price: makeMoney(5) }]); // subtotal = 10
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const newItem = makeItem({ quantity: 1, price: makeMoney(3) });
    const addResult = createResult.value.addItem(newItem);
    expect(addResult.ok).toBe(true);
    if (!addResult.ok) return;

    // subtotal nuevo = 10 + 3 = 13
    expect(addResult.value.totals.subtotal.amount).toBe(13);
  });
});

describe("Order.cancel", () => {
  it("cancela desde 'pending'", () => {
    const createResult = makeOrder();
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const cancelResult = createResult.value.cancel("cliente cambio de opinion");
    expect(cancelResult.ok).toBe(true);
    if (!cancelResult.ok) return;
    expect(cancelResult.value.status).toBe("cancelled");
    expect(cancelResult.value.cancelReason).toBe("cliente cambio de opinion");
  });

  it("cancela desde 'paid'", () => {
    const createResult = makeOrder();
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const paidResult = createResult.value.markPaid(new Date());
    expect(paidResult.ok).toBe(true);
    if (!paidResult.ok) return;

    const cancelResult = paidResult.value.cancel("devolucion solicitada");
    expect(cancelResult.ok).toBe(true);
    if (!cancelResult.ok) return;
    expect(cancelResult.value.status).toBe("cancelled");
  });

  it("NO puede cancelar desde 'fulfilled'", () => {
    const order = Order.rehydrate({
      id: "x", tenantId: "t", customerId: "c",
      items: [makeItem()],
      totals: makeTotals(11, 2, 0),
      status: "fulfilled",
      createdAt: new Date(),
    });
    const result = order.cancel("intento");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("INVALID_ORDER_STATE");
  });

  it("NO puede cancelar desde 'cancelled'", () => {
    const order = Order.rehydrate({
      id: "x", tenantId: "t", customerId: "c",
      items: [makeItem()],
      totals: makeTotals(11, 2, 0),
      status: "cancelled",
      createdAt: new Date(),
    });
    const result = order.cancel("doble cancelacion");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("INVALID_ORDER_STATE");
  });
});

describe("Order.markPaid", () => {
  it("marca como pagado desde 'pending'", () => {
    const createResult = makeOrder();
    expect(createResult.ok).toBe(true);
    if (!createResult.ok) return;

    const paidAt = new Date("2026-04-20T10:00:00Z");
    const result = createResult.value.markPaid(paidAt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.status).toBe("paid");
    expect(result.value.paidAt).toEqual(paidAt);
  });

  it("NO puede marcar como pagado desde 'fulfilled'", () => {
    const order = Order.rehydrate({
      id: "x", tenantId: "t", customerId: "c",
      items: [makeItem()],
      totals: makeTotals(11, 2, 0),
      status: "fulfilled",
      createdAt: new Date(),
    });
    const result = order.markPaid(new Date());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("INVALID_ORDER_STATE");
  });

  it("NO puede marcar como pagado desde 'cancelled'", () => {
    const order = Order.rehydrate({
      id: "x", tenantId: "t", customerId: "c",
      items: [makeItem()],
      totals: makeTotals(11, 2, 0),
      status: "cancelled",
      createdAt: new Date(),
    });
    const result = order.markPaid(new Date());
    expect(result.ok).toBe(false);
  });
});

describe("canTransitionTo — state machine completa", () => {
  const cases: Array<[OrderStatus, OrderStatus, boolean]> = [
    ["pending",   "paid",       true],
    ["pending",   "cancelled",  true],
    ["pending",   "fulfilled",  false],
    ["pending",   "pending",    false],
    ["paid",      "fulfilled",  true],
    ["paid",      "cancelled",  true],
    ["paid",      "pending",    false],
    ["fulfilled", "cancelled",  false],
    ["fulfilled", "paid",       false],
    ["cancelled", "pending",    false],
    ["cancelled", "paid",       false],
    ["cancelled", "fulfilled",  false],
  ];

  for (const [from, to, expected] of cases) {
    it(`${from} → ${to} debe ser ${expected}`, () => {
      expect(canTransitionTo(from, to)).toBe(expected);
    });
  }
});

describe("Order.rehydrate", () => {
  it("reconstruye estado exacto desde props persistidas", () => {
    const paidAt = new Date("2026-04-20T09:00:00Z");
    const created = new Date("2026-04-20T08:00:00Z");

    const order = Order.rehydrate({
      id:           "order-rehydrate-001",
      tenantId:     "tenant-xyz",
      customerId:   "+51999000099",
      items:        [makeItem()],
      totals:       makeTotals(11, 2, 0),
      status:       "paid",
      cancelReason: undefined,
      paidAt,
      createdAt:    created,
    });

    expect(order.id).toBe("order-rehydrate-001");
    expect(order.tenantId).toBe("tenant-xyz");
    expect(order.status).toBe("paid");
    expect(order.paidAt).toEqual(paidAt);
    expect(order.createdAt).toEqual(created);
    expect(order.items.length).toBe(1);
  });
});

describe("Money", () => {
  it("suma dos Money de la misma currency", () => {
    const a = makeMoney(10);
    const b = makeMoney(5);
    const result = a.add(b);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.amount).toBe(15);
    expect(result.value.currency).toBe("PEN");
  });

  it("rechaza suma de currencies distintas", () => {
    const pen = makeMoney(10);
    const usd = Money.rehydrate(5, "USD");
    const result = pen.add(usd);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("MIXED_CURRENCY");
  });

  it("rechaza amount negativo", () => {
    const result = Money.create(-1, "PEN");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.kind).toBe("INVALID_MONEY");
  });

  it("acepta amount = 0", () => {
    const result = Money.create(0, "PEN");
    expect(result.ok).toBe(true);
  });
});
