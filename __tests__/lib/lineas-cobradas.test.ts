/** La utilidad bruta se calcula sobre lo cobrado, no sobre el precio de lista. */
import { describe, expect, it } from "vitest";
import { aggregateMargin, lineasCobradas } from "@/lib/chart-helpers";

const costo = (id: string | number) => (id === "arroz" ? 18.29 : null);

describe("lineasCobradas", () => {
  it("una venta de S/ 24,90 cobrada en S/ 0,10 ya no da S/ 6,61 de utilidad", () => {
    const lineas = [{ productId: "arroz", quantity: 1, price: 24.9 }];
    expect(aggregateMargin(lineas, costo).utilidadBruta).toBeCloseTo(6.61, 2); // el bug
    const m = aggregateMargin(lineasCobradas(lineas, 0.1), costo);
    expect(m.ingresos).toBeCloseTo(0.1, 6);
    expect(m.utilidadBruta).toBeCloseTo(0.1 - 18.29, 2); // vendida a pérdida: se ve
  });

  it("sin descuento no cambia nada", () => {
    const lineas = [{ productId: "arroz", quantity: 2, price: 24.9 }];
    expect(lineasCobradas(lineas, 49.8)).toEqual(lineas);
  });

  it("delivery o propina (cobró más que los ítems) no se reparte como venta", () => {
    const lineas = [{ productId: "arroz", quantity: 1, price: 24.9 }];
    expect(lineasCobradas(lineas, 30)).toEqual(lineas);
  });

  it("el descuento se reparte en proporción", () => {
    const r = lineasCobradas(
      [
        { productId: "a", quantity: 1, price: 30 },
        { productId: "b", quantity: 2, price: 10 },
      ],
      40,
    );
    expect(r[0].price).toBeCloseTo(24, 6);
    expect(r[1].price).toBeCloseTo(8, 6);
  });
});
