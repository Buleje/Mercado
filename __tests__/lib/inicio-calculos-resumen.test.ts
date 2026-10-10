import { describe, expect, it } from "vitest";
import {
  buildBuckets,
  cajaPorDia,
  clientesPorDia,
  comprasPorProveedor,
  horaPico,
  kpisCaja,
  kpisProductos,
  productosTop,
} from "@/components/admin/inicio/resumen/calculos-resumen";

// Fechas armadas en hora LOCAL (como las arma el tablero en el navegador).
const dia = (d: number, h = 10) => new Date(2026, 9, d, h, 0, 0).toISOString();
const rangoOct = () => ({ from: new Date(2026, 9, 1, 0, 0, 0), to: new Date(2026, 9, 3, 23, 59, 59, 999) });

describe("buildBuckets", () => {
  it("un tramo por día con el mes escrito a mano en minúscula («01 oct»)", () => {
    const { from, to } = rangoOct();
    expect(buildBuckets(from, to).map((b) => b.label)).toEqual(["01 oct", "02 oct", "03 oct"]);
  });

  it("un solo día → 6 tramos de 4 h", () => {
    const from = new Date(2026, 9, 9, 0, 0, 0);
    const to = new Date(2026, 9, 9, 23, 59, 59);
    const b = buildBuckets(from, to);
    expect(b).toHaveLength(6);
    expect(b[0].label).toBe("00h");
    expect(b[5].label).toBe("20h");
  });
});

describe("caja por día", () => {
  const { from, to } = rangoOct();
  const buckets = buildBuckets(from, to);

  it("no redondea por día: una venta de S/ 0.10 no se vuelve 0", () => {
    const caja = cajaPorDia([], [{ createdAt: dia(1), total: 0.1, items: [] }], [], buckets);
    expect(caja[0].ingresos).toBeCloseTo(0.1);
    expect(kpisCaja(caja, []).ingresos).toBeCloseTo(0.1);
  });

  it("los pedidos cancelados no entran; las compras salen", () => {
    const caja = cajaPorDia(
      [
        { id: 1, createdAt: dia(2), total: 50, status: "entregado", items: [] },
        { id: 2, createdAt: dia(2), total: 99, status: "cancelado", items: [] },
      ],
      [],
      [{ id: "c1", createdAt: dia(3), total: 600 }],
      buckets,
    );
    expect(caja.map((r) => [r.ingresos, r.egresos])).toEqual([[0, 0], [50, 0], [0, 600]]);
    const k = kpisCaja(caja, [{ id: 1, amount: 30 }, { id: 2, amount: 20, paid: true }]);
    expect(k).toEqual({ ingresos: 50, egresos: 600, neto: -550, pendientePagar: 30 });
  });
});

describe("compras por proveedor", () => {
  it("agrupa por proveedor con el nombre ENTERO (lo corta el eje, no la cuenta)", () => {
    const { from, to } = rangoOct();
    const filas = comprasPorProveedor(
      [
        { id: 1, createdAt: dia(1), total: 600, supplierName: "Frigorífico Amazónico SAC" },
        { id: 2, createdAt: dia(2), total: 400, supplierName: "Frigorífico Amazónico SAC", paid: true },
        { id: 3, createdAt: dia(20), total: 999, supplierName: "Fuera del rango" },
      ],
      from.getTime(),
      to.getTime(),
    );
    expect(filas).toEqual([{ proveedor: "Frigorífico Amazónico SAC", monto: 1000, ordenes: 2, pendiente: 600 }]);
  });
});

describe("clientes por día", () => {
  it("nuevos por fecha de alta; el pedido de un cliente de antes cuenta como recurrente", () => {
    const { from, to } = rangoOct();
    const buckets = buildBuckets(from, to);
    const filas = clientesPorDia(
      [{ phone: "999", createdAt: new Date(2026, 8, 1).toISOString() }, { phone: "888", createdAt: dia(2) }],
      [{ id: 1, createdAt: dia(3), total: 10, status: "entregado", items: [], customer: { phone: "999" } }],
      buckets,
    );
    expect(filas.map((f) => [f.nuevos, f.recurrentes])).toEqual([[0, 0], [1, 0], [0, 1]]);
  });
});

describe("productos más vendidos", () => {
  const { from, to } = rangoOct();
  const products = [
    { id: 1, name: "Arroz Costeño 750 g", price: 5, costPrice: 4 },
    { id: 2, name: "Gaseosa", price: 3 },
  ];

  it("margen sólo con costo real: si falta el de alguno, el % queda en null", () => {
    const top = productosTop(
      products,
      [],
      [{ createdAt: dia(1), total: 16, items: [{ productId: 1, quantity: 2 }, { productId: 2, quantity: 2 }] }],
      from.getTime(),
      to.getTime(),
    );
    expect(top.map((t) => [t.producto, t.ingresos, t.margen])).toEqual([["Arroz Costeño 750 g", 10, 2], ["Gaseosa", 6, 0]]);
    expect(kpisProductos(top).margenPct).toBeNull();
    expect(kpisProductos(top.slice(0, 1)).margenPct).toBeCloseTo(20);
  });
});

describe("hora pico", () => {
  it("null con menos de 5 registros; si no, la hora con más", () => {
    const ventas = (h: number, n: number) => Array.from({ length: n }, () => ({ createdAt: dia(1, h) }));
    expect(horaPico([], ventas(22, 4))).toBeNull();
    expect(horaPico([], [...ventas(22, 3), ...ventas(9, 2)])).toBe("22:00");
  });
});
