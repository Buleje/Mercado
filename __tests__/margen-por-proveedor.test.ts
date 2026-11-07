import { describe, expect, it } from "vitest";
import { margenPorProveedor, ultimaCompraPorProducto, type LineaVendida } from "@/lib/analytics/margen-por-proveedor";

const linea = (productId: number, quantity: number, cobrado: number, costPrice: number | null, productCostPrice: number | null = null): LineaVendida => ({
  productId,
  name: `P${productId}`,
  quantity,
  cobrado,
  costPrice,
  productCostPrice,
});

describe("margen por proveedor", () => {
  it("cada producto va con el proveedor de su ÚLTIMA compra recibida", () => {
    const u = ultimaCompraPorProducto([
      { productId: 1, supplierId: "A", proveedor: "Andes", fecha: new Date("2026-09-01") },
      { productId: 1, supplierId: "B", proveedor: "Bebidas", fecha: new Date("2026-10-01") },
      { productId: 1, supplierId: "A", proveedor: "Andes", fecha: new Date("2026-09-15") },
      { productId: 2, supplierId: "A", proveedor: "Andes", fecha: new Date("2026-08-01") },
    ]);
    expect(u.get(1)?.supplierId).toBe("B");
    expect(u.get(2)?.supplierId).toBe("A");
  });

  it("suma ventas, costo y ganancia por proveedor; lo sin compra va aparte", () => {
    const ultima = new Map([
      [1, { supplierId: "A", proveedor: "Andes", fecha: "2026-10-01T00:00:00.000Z" }],
      [2, { supplierId: "A", proveedor: "Andes", fecha: "2026-10-01T00:00:00.000Z" }],
      [3, { supplierId: "B", proveedor: "Bebidas", fecha: "2026-10-01T00:00:00.000Z" }],
    ]);
    const r = margenPorProveedor(
      [
        linea(1, 2, 10, 3), // ventas 10, costo 6
        linea(1, 1, 5, 3), // ventas 5, costo 3
        linea(2, 4, 8.4, 1.1), // ventas 8,40, costo 4,40
        linea(3, 10, 30, null, 2.5), // costo estimado: 25
        linea(9, 1, 7, 4), // sin compra registrada
      ],
      ultima,
    );
    expect(r.filas.map((f) => f.proveedor)).toEqual(["Andes", "Bebidas"]);
    const andes = r.filas[0];
    expect(andes).toMatchObject({ productos: 2, unidades: 7, ventas: 23.4, costo: 13.4, ganancia: 10, margenPct: 42.7, costoEstimado: false });
    expect(andes.top[0]).toMatchObject({ productId: 1, ganancia: 6 });
    expect(r.filas[1]).toMatchObject({ ventas: 30, costo: 25, ganancia: 5, costoEstimado: true });
    expect(r.sinProveedor).toMatchObject({ supplierId: null, proveedor: "Sin compra registrada", ventas: 7, ganancia: 3 });
    // El total incluye lo sin proveedor; 53,40 de 60,40 tiene proveedor.
    expect(r.resumen).toEqual({ ventas: 60.4, costo: 42.4, ganancia: 18, margenPct: 29.8, conProveedorPct: 88.4 });
  });

  it("céntimos: 0,1 + 0,2 no deja 0,30000000000000004", () => {
    const ultima = new Map([[1, { supplierId: "A", proveedor: "Andes", fecha: "2026-10-01T00:00:00.000Z" }]]);
    const r = margenPorProveedor([linea(1, 1, 0.1, 0), linea(1, 1, 0.2, 0)], ultima);
    expect(r.filas[0].ventas).toBe(0.3);
  });

  it("sin ventas: sin filas y margen 0, sin dividir por cero", () => {
    expect(margenPorProveedor([], new Map())).toEqual({ filas: [], sinProveedor: null, resumen: { ventas: 0, costo: 0, ganancia: 0, margenPct: 0, conProveedorPct: 0 } });
  });
});
