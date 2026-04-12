/**
 * Eval: Order status transitions (pendiente -> confirmado -> entregado).
 * Based on the OrderStatus enum from prisma/schema.prisma.
 * Business rule: orders follow a strict state machine. Invalid transitions are blocked.
 */
import { describe, it, expect } from "vitest";

type OrderStatus = "pendiente" | "confirmado" | "en_camino" | "entregado" | "cancelado";

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pendiente: ["confirmado", "cancelado"],
  confirmado: ["en_camino", "cancelado"],
  en_camino: ["entregado", "cancelado"],
  entregado: [],
  cancelado: [],
};

function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}

describe("Checkout > Order State Machine", () => {
  it("should allow pendiente -> confirmado", () => {
    expect(canTransition("pendiente", "confirmado")).toBe(true);
  });

  it("should allow confirmado -> en_camino", () => {
    expect(canTransition("confirmado", "en_camino")).toBe(true);
  });

  it("should allow en_camino -> entregado", () => {
    expect(canTransition("en_camino", "entregado")).toBe(true);
  });

  it("should block pendiente -> entregado (skip steps)", () => {
    expect(canTransition("pendiente", "entregado")).toBe(false);
  });

  it("should block entregado -> any (terminal state)", () => {
    expect(canTransition("entregado", "pendiente")).toBe(false);
    expect(canTransition("entregado", "cancelado")).toBe(false);
  });

  it("should block cancelado -> any (terminal state)", () => {
    expect(canTransition("cancelado", "pendiente")).toBe(false);
    expect(canTransition("cancelado", "confirmado")).toBe(false);
  });

  it("should allow cancellation from any non-terminal state", () => {
    expect(canTransition("pendiente", "cancelado")).toBe(true);
    expect(canTransition("confirmado", "cancelado")).toBe(true);
    expect(canTransition("en_camino", "cancelado")).toBe(true);
  });
});
