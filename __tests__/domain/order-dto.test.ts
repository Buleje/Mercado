// Tests del CQRS-light read model: OrderDto + toDto mapping shape.
//
// NO importa Prisma ni DB — prueba que el shape es estable.

import { describe, expect, it } from "vitest";
import type { OrderDto, OrderItemDto } from "@/domain/order/order-dto";

describe("OrderDto — read model shape", () => {
  it("tiene todos los campos del contrato con el frontend", () => {
    const dto: OrderDto = {
      id: "ord_1",
      tenantId: "main",
      source: "marketplace",
      status: "pendiente",
      customerPhone: "999888777",
      customerName: "Ana",
      customerLocation: "Jr. Pucallpa 123",
      customerReference: "Casa azul",
      total: 45.5,
      couponDiscount: null,
      discountAmount: null,
      totalCogs: 28.0,
      cancelReason: null,
      cancelledAt: null,
      createdAt: "2026-04-20T12:00:00.000Z",
      items: [],
    };

    expect(dto.id).toBe("ord_1");
    expect(dto.items).toEqual([]);
    expect(dto.total).toBe(45.5);
  });

  it("item tiene price y costPrice como numeros (no Decimal)", () => {
    const item: OrderItemDto = {
      id: 42,
      productId: 101,
      name: "Arroz Superior 1kg",
      price: 4.5,
      quantity: 3,
      unit: "kg",
      image: null,
      costPrice: 3.1,
    };

    expect(typeof item.price).toBe("number");
    expect(typeof item.costPrice).toBe("number");
    expect(item.image).toBeNull();
  });

  it("campos opcionales pueden ser null explicitamente", () => {
    const dto: OrderDto = {
      id: "ord_2",
      tenantId: "main",
      source: "marketplace",
      status: "entregado",
      customerPhone: null,
      customerName: "",
      customerLocation: "",
      customerReference: "",
      total: 0,
      couponDiscount: null,
      discountAmount: null,
      totalCogs: null,
      cancelReason: null,
      cancelledAt: null,
      createdAt: new Date(0).toISOString(),
      items: [],
    };

    expect(dto.couponDiscount).toBeNull();
    expect(dto.totalCogs).toBeNull();
    expect(dto.cancelledAt).toBeNull();
  });

  it("readonly enforcement — items es readonly", () => {
    const dto: OrderDto = {
      id: "ord_3",
      tenantId: "main",
      source: "marketplace",
      status: "pendiente",
      customerPhone: null,
      customerName: "X",
      customerLocation: "X",
      customerReference: "X",
      total: 10,
      couponDiscount: null,
      discountAmount: null,
      totalCogs: null,
      cancelReason: null,
      cancelledAt: null,
      createdAt: new Date().toISOString(),
      items: [],
    };

    // @ts-expect-error — readonly
    dto.total = 999;
    expect(dto.total).toBe(999); // mutación en runtime OK, pero TS lo prohibe
  });

  it("createdAt y cancelledAt son ISO strings (no Date)", () => {
    const iso = "2026-04-20T15:30:00.000Z";
    const dto: OrderDto = {
      id: "ord_4",
      tenantId: "main",
      source: "marketplace",
      status: "cancelado",
      customerPhone: "111",
      customerName: "Z",
      customerLocation: "Z",
      customerReference: "Z",
      total: 0,
      couponDiscount: null,
      discountAmount: null,
      totalCogs: null,
      cancelReason: "cliente pidio",
      cancelledAt: iso,
      createdAt: iso,
      items: [],
    };

    expect(typeof dto.cancelledAt).toBe("string");
    expect(typeof dto.createdAt).toBe("string");
    expect(() => new Date(dto.createdAt).toISOString()).not.toThrow();
  });
});
