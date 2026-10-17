import { describe, expect, it } from "vitest";
import { enCaminoPorProducto, type LineaDeOrdenAbierta } from "@/lib/compras/en-camino";

/**
 * C27 (17-10): una orden vigente resta de la siguiente sugerencia; una parcial
 * resta SÓLO lo que falta llegar; cancelar o recibir la saca de la cuenta.
 */

const linea = (o: Partial<LineaDeOrdenAbierta>): LineaDeOrdenAbierta => ({
  purchaseOrderId: "oc1", status: "pendiente", productId: 1, name: "Arroz 5 kg", quantity: 20, deliveryDate: null, ...o,
});

describe("enCaminoPorProducto", () => {
  it("una pendiente sin recepciones suma entera, con su día prometido", () => {
    const r = enCaminoPorProducto([linea({ deliveryDate: new Date("2026-10-23T00:00:00.000Z") })], []);
    expect(r.get(1)).toEqual({ confirmado: 20, ordenes: 1, llegaEl: "2026-10-23", borrador: 0 });
  });

  it("una parcial resta lo recibido y lo que no llegará (antes no contaba nada)", () => {
    const r = enCaminoPorProducto(
      [linea({ status: "parcial" })],
      [
        { id: "r1", purchaseOrderId: "oc1", itemsJson: [{ productId: 1, receivedQty: 8, condition: "conforme" }] },
        { id: "r2", purchaseOrderId: "oc1", itemsJson: [{ product: "arroz 5 KG", receivedQty: 0, condition: "faltante", creditoUnidades: 2 }] },
      ],
    );
    expect(r.get(1)?.confirmado).toBe(10); // 20 − 8 − 2
  });

  it("lo recibido de más no deja tránsito negativo y el producto sale de la cuenta", () => {
    const r = enCaminoPorProducto([linea({ status: "parcial" })], [{ id: "r1", purchaseOrderId: "oc1", itemsJson: [{ productId: 1, receivedQty: 25 }] }]);
    expect(r.has(1)).toBe(false);
  });

  it("recibida o cancelada no suma: cancelar la orden vuelve a calcular la sugerencia", () => {
    const r = enCaminoPorProducto([linea({ status: "cancelado" }), linea({ purchaseOrderId: "oc2", status: "recibido" })], []);
    expect(r.size).toBe(0);
  });

  it("el borrador automático no se resta: se informa aparte", () => {
    const r = enCaminoPorProducto([linea({ status: "auto_generated", quantity: 40 })], []);
    expect(r.get(1)).toEqual({ confirmado: 0, ordenes: 0, llegaEl: null, borrador: 40 });
  });

  it("dos órdenes suman y el día es el más cercano; la recepción de una no toca la otra", () => {
    const r = enCaminoPorProducto(
      [
        linea({ deliveryDate: "2026-10-30" }),
        linea({ purchaseOrderId: "oc2", status: "parcial", quantity: 10, deliveryDate: "2026-10-21" }),
      ],
      [{ id: "r1", purchaseOrderId: "oc2", itemsJson: [{ productId: 1, receivedQty: 4 }] }],
    );
    expect(r.get(1)).toEqual({ confirmado: 26, ordenes: 2, llegaEl: "2026-10-21", borrador: 0 });
  });

  it("el mismo producto en dos líneas de una orden se compara contra el total", () => {
    const r = enCaminoPorProducto(
      [linea({ quantity: 5 }), linea({ quantity: 5 })],
      [{ id: "r1", purchaseOrderId: "oc1", itemsJson: [{ productId: 1, receivedQty: 7 }] }],
    );
    expect(r.get(1)?.confirmado).toBe(3);
  });
});
