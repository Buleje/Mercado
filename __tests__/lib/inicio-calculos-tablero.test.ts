import { describe, expect, it } from "vitest";
import {
  conteoPorTramo,
  gananciaDelPeriodo,
  mapaDiaHora,
  metodosDePago,
  stockEnRiesgo,
} from "@/components/admin/inicio/resumen/calculos-tablero";
import { buildBuckets, type Order, type Product, type Sale } from "@/components/admin/inicio/resumen/calculos-resumen";

// Fechas en hora LOCAL, como las arma el tablero en el navegador. 01/10/2026 = jueves.
const dia = (d: number, h = 10, min = 30) => new Date(2026, 9, d, h, min, 0).toISOString();
const desde = new Date(2026, 9, 1, 0, 0, 0).getTime();
const hasta = new Date(2026, 9, 3, 23, 59, 59, 999).getTime();

const pedido = (o: Partial<Order> & { paymentMethod?: string }): Order =>
  ({ id: 1, createdAt: dia(1), total: 0, status: "entregado", items: [], ...o }) as Order;
const venta = (s: Partial<Sale> & { payment?: string }): Sale =>
  ({ createdAt: dia(1), total: 0, items: [], ...s }) as Sale;

describe("metodosDePago", () => {
  it("suma pedidos y ventas por medio, sin medio = efectivo, y deja fuera cancelados y fuera de rango", () => {
    const filas = metodosDePago(
      [
        pedido({ total: 30, paymentMethod: "Yape" }),
        pedido({ total: 20 }),
        pedido({ total: 99, paymentMethod: "yape", status: "cancelado" }),
        pedido({ total: 99, paymentMethod: "yape", createdAt: dia(5) }),
      ],
      [venta({ total: 50, payment: "yape" })],
      desde,
      hasta,
    );
    expect(filas.map((f) => [f.clave, f.total, f.veces])).toEqual([
      ["yape", 80, 2],
      ["efectivo", 20, 1],
    ]);
    expect(filas[0].metodo).toBe("Yape");
    expect(filas[0].pct).toBeCloseTo(80);
  });
});

describe("mapaDiaHora", () => {
  it("lunes = fila 0, descarta las 00:00 exactas (fecha sin hora) y recorta las horas vacías", () => {
    const m = mapaDiaHora(
      [pedido({ total: 10, createdAt: dia(1, 9) }), pedido({ total: 5, createdAt: dia(1, 0, 0) })],
      [venta({ total: 40, createdAt: dia(3, 18) })],
      desde,
      hasta,
    );
    expect(m.registros).toBe(2);
    expect(m.monto[3][9]).toBe(10); // jueves 09:00
    expect(m.monto[5][18]).toBe(40); // sábado 18:00
    expect(m.horaDesde).toBe(8);
    expect(m.horaHasta).toBe(19);
    expect(m.total).toBe(50);
    expect(m.max).toBe(40);
  });
});

describe("stockEnRiesgo", () => {
  const p = (o: Partial<Product> & { type?: string }): Product =>
    ({ id: o.name ?? "x", name: "x", active: true, price: 1, ...o }) as Product;

  it("agotados primero, después el más corto contra su mínimo; servicios e inactivos fuera", () => {
    const { filas, total } = stockEnRiesgo(
      [
        p({ name: "holgado", stock: 9, stockMin: 10 }),
        p({ name: "corto", stock: 1, stockMin: 10 }),
        p({ name: "agotado", stock: 0, stockMin: 5 }),
        p({ name: "servicio", stock: 0, type: "service" }),
        p({ name: "inactivo", stock: 0, active: false }),
        p({ name: "bien", stock: 50, stockMin: 5 }),
      ],
      3,
    );
    expect(total).toBe(3);
    expect(filas.map((f) => f.producto)).toEqual(["agotado", "corto", "holgado"]);
    expect(filas[0].agotado).toBe(true);
  });
});

describe("gananciaDelPeriodo", () => {
  it("el margen sale sólo de lo que tiene costo; lo sin costo se cuenta aparte", () => {
    const products = [
      { id: 1, name: "Arroz", price: 5, costPrice: 4 },
      { id: 2, name: "Pan", price: 1 },
    ] as Product[];
    const g = gananciaDelPeriodo(
      products,
      [pedido({ items: [{ id: 1, quantity: 10, price: 5 }] })],
      [venta({ items: [{ productId: 2, quantity: 3 }] })],
      desde,
      hasta,
    );
    expect(g.vendido).toBe(53);
    expect(g.vendidoConCosto).toBe(50);
    expect(g.ganancia).toBe(10);
    expect(g.sinCosto).toBe(1);
    expect(g.margenPct).toBeCloseTo(20);
  });

  it("sin ningún costo cargado no inventa un margen", () => {
    const g = gananciaDelPeriodo(
      [{ id: 2, name: "Pan", price: 1 }] as Product[],
      [],
      [venta({ items: [{ productId: 2, quantity: 3 }] })],
      desde,
      hasta,
    );
    expect(g.margenPct).toBeNull();
  });
});

describe("conteoPorTramo", () => {
  it("cuenta pedidos no cancelados y ventas en su día", () => {
    const buckets = buildBuckets(new Date(desde), new Date(hasta));
    const n = conteoPorTramo(
      [pedido({ createdAt: dia(1) }), pedido({ createdAt: dia(2), status: "cancelado" })],
      [venta({ createdAt: dia(3) }), venta({ createdAt: dia(3, 15) })],
      buckets,
    );
    expect(n).toEqual([1, 0, 2]);
  });
});
