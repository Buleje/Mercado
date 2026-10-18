import { describe, expect, it } from "vitest";
import { montosSugeridos } from "@/components/admin/pos/pago/montos-sugeridos";

describe("montosSugeridos — los montos que el cliente suele dar", () => {
  it.each([
    [551, [560, 600, 1000]],
    [18.5, [20, 50, 100]],
    [41.6, [50, 100, 200]],
    [61, [70, 100, 200]],
    [3.5, [5, 10, 20]],
    [5, [10, 20, 50]],
    [560, [600, 1000]],
    [1234, [1240, 1250, 1300]],
  ])("S/ %s → %j", (total, esperado) => {
    expect(montosSugeridos(total)).toEqual(esperado);
  });

  it("nunca ofrece el total exacto ni algo menor (para eso está «Exacto»)", () => {
    for (const total of [10, 20, 50, 100, 200, 1000, 0.3, 99.99]) {
      for (const monto of montosSugeridos(total)) expect(monto).toBeGreaterThan(total);
    }
    expect(montosSugeridos(1000)).toEqual([]);
  });

  it("cuenta en céntimos: 0.1 + 0.2 no se vuelve 0.30000000000000004", () => {
    expect(montosSugeridos(0.1 + 0.2)).toEqual([5, 10, 20]);
    expect(montosSugeridos(40.000000001)).toEqual([50, 100, 200]);
  });

  it("sin total que cobrar no sugiere nada", () => {
    expect(montosSugeridos(0)).toEqual([]);
    expect(montosSugeridos(-5)).toEqual([]);
    expect(montosSugeridos(Number.NaN)).toEqual([]);
    expect(montosSugeridos(551, 0)).toEqual([]);
  });

  it("respeta cuántos pide", () => {
    expect(montosSugeridos(551, 2)).toEqual([560, 600]);
    expect(montosSugeridos(18.5, 5)).toEqual([20, 50, 100, 200, 500]);
  });
});
