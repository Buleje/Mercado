import { describe, expect, it } from "vitest";
import {
  assertTransition,
  isValidTransition,
  type OrderState,
} from "@/lib/state-machines/order-machine";

describe("order-machine · isValidTransition", () => {
  const validCases: Array<[OrderState, string, boolean]> = [
    ["pendiente", "CONFIRM", true],
    ["pendiente", "CANCEL", true],
    ["pendiente", "DISPATCH", false],
    ["pendiente", "DELIVER", false],

    ["confirmado", "DISPATCH", true],
    ["confirmado", "CANCEL", true],
    ["confirmado", "CONFIRM", false],
    ["confirmado", "DELIVER", false],

    ["en_camino", "DELIVER", true],
    ["en_camino", "CANCEL", true],
    ["en_camino", "CONFIRM", false],
    ["en_camino", "DISPATCH", false],

    ["entregado", "CANCEL", false],
    ["entregado", "CONFIRM", false],
    ["entregado", "DISPATCH", false],
    ["entregado", "DELIVER", false],

    ["cancelado", "CONFIRM", false],
    ["cancelado", "DISPATCH", false],
    ["cancelado", "DELIVER", false],
    ["cancelado", "CANCEL", false],
  ];

  it.each(validCases)("%s + %s → %s", (from, event, expected) => {
    // biome-ignore lint/suspicious/noExplicitAny: test helper
    expect(isValidTransition(from, event as any)).toBe(expected);
  });
});

describe("order-machine · assertTransition", () => {
  it("does not throw on valid transition", () => {
    expect(() => assertTransition("pendiente", "CONFIRM")).not.toThrow();
    expect(() => assertTransition("en_camino", "DELIVER")).not.toThrow();
  });

  it("throws on transition from final state", () => {
    expect(() => assertTransition("entregado", "CANCEL")).toThrow(
      /Transición inválida/,
    );
    expect(() => assertTransition("cancelado", "CONFIRM")).toThrow();
  });

  it("throws on skipping states", () => {
    // pendiente → en_camino (skipping confirmado) is not allowed
    expect(() => assertTransition("pendiente", "DISPATCH")).toThrow();
    // pendiente → entregado (skipping everything) is not allowed
    expect(() => assertTransition("pendiente", "DELIVER")).toThrow();
  });
});
