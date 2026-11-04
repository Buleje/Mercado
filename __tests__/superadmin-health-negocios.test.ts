import { describe, it, expect } from "vitest";
import {
  armarSaludDeNegocios,
  chequeosDeAislamiento,
  estadoGeneral,
  type ConteosDeNegocios,
  type SondaAislamiento,
} from "@/lib/superadmin/health-negocios";

type Conteos = { [K in keyof ConteosDeNegocios]: Map<string, number> };

const vacio = (): Conteos => ({
  productos: new Map(),
  pedidos: new Map(),
  clientes: new Map(),
  pedidos24h: new Map(),
  itemsCruzados: new Map(),
});

const TODAS_EN_CERO: Record<SondaAislamiento, number | null> = {
  pedidosHuerfanos: 0,
  productosHuerfanos: 0,
  clientesHuerfanos: 0,
  itemsCruzados: 0,
  adminsHuerfanos: 0,
};

describe("chequeosDeAislamiento", () => {
  it("5 pruebas, en el orden de siempre, todas pasan con 0", () => {
    const r = chequeosDeAislamiento(TODAS_EN_CERO);
    expect(r.map((c) => c.name)).toEqual([
      "Pedidos sin tenant válido",
      "Productos sin tenant válido",
      "Clientes sin tenant válido",
      "Items de pedido cross-tenant",
      "Admins sin tenant válido",
    ]);
    expect(r.every((c) => c.passed)).toBe(true);
  });

  it("una consulta caída (null) NO pasa y dice «Error al verificar»", () => {
    const r = chequeosDeAislamiento({ ...TODAS_EN_CERO, clientesHuerfanos: null });
    const c = r.find((x) => x.name === "Clientes sin tenant válido");
    expect(c).toEqual({ name: "Clientes sin tenant válido", passed: false, detail: "Error al verificar" });
  });

  it("huérfanos > 0 falla con la cantidad en el detalle", () => {
    const r = chequeosDeAislamiento({ ...TODAS_EN_CERO, pedidosHuerfanos: 3, itemsCruzados: 2 });
    expect(r[0]).toMatchObject({ passed: false, detail: "3 pedido(s) con tenantId huérfano" });
    expect(r[3].detail).toContain("2 item(s)");
  });
});

describe("armarSaludDeNegocios", () => {
  it("cruza por Tenant.id (no por el slug): un negocio con conteos bajo su id los muestra", () => {
    const c = vacio();
    c.productos.set("cmpx_id", 10);
    c.pedidos.set("cmpx_id", 4);
    c.pedidos24h.set("cmpx_id", 1);
    // Una clave por slug NO debe contar para nadie.
    c.pedidos.set("tienda-slug", 99);
    const [t] = armarSaludDeNegocios([{ id: "cmpx_id", slug: "tienda-slug", name: "Tienda" }], c, new Map());
    expect(t.stats).toMatchObject({ products: 10, orders: 4, ordersLast24h: 1, customers: 0 });
  });

  it("aserradero sin productos ni pedidos: suma sus operaciones y no queda como vacío", () => {
    const ultima = new Date("2026-11-01T15:00:00.000Z");
    const [t] = armarSaludDeNegocios(
      [{ id: "blas", slug: "blas", name: "Blas" }],
      vacio(),
      new Map([["blas", { total30d: 87, ultima }]]),
    );
    expect(t.stats.products).toBe(0);
    expect(t.stats.orders).toBe(0);
    expect(t.stats.operations30d).toBe(87);
    expect(t.stats.lastOperationAt).toBe("2026-11-01T15:00:00.000Z");
    expect(t.checks[0].detail).toBe("0 productos, 0 pedidos, 0 clientes, 87 operaciones (30 d)");
    expect(t.status).toBe("healthy");
  });

  it("sin medición de operaciones queda null (no un 0 falso) y el detalle no las menciona", () => {
    const [t] = armarSaludDeNegocios([{ id: "a", slug: "a", name: null }], vacio(), new Map());
    expect(t.stats.operations30d).toBeNull();
    expect(t.stats.lastOperationAt).toBeNull();
    expect(t.checks[0].detail).toBe("0 productos, 0 pedidos, 0 clientes");
    expect(t.name).toBe("a"); // sin nombre usa el slug
  });

  it("items cruzados vuelven crítico al negocio", () => {
    const c = vacio();
    c.itemsCruzados.set("a", 2);
    const [t] = armarSaludDeNegocios([{ id: "a", slug: "a", name: "A" }], c, new Map());
    expect(t.status).toBe("critical");
    expect(t.checks[1]).toMatchObject({ passed: false });
  });
});

describe("estadoGeneral", () => {
  const sano = armarSaludDeNegocios([{ id: "a", slug: "a", name: "A" }], vacio(), new Map());
  const critico = armarSaludDeNegocios(
    [{ id: "a", slug: "a", name: "A" }],
    { ...vacio(), itemsCruzados: new Map([["a", 1]]) },
    new Map(),
  );

  it("healthy cuando todo pasa", () => {
    expect(estadoGeneral(sano, chequeosDeAislamiento(TODAS_EN_CERO))).toBe("healthy");
  });
  it("critical si falla una prueba global", () => {
    expect(estadoGeneral(sano, chequeosDeAislamiento({ ...TODAS_EN_CERO, adminsHuerfanos: 1 }))).toBe("critical");
  });
  it("critical si un negocio está crítico", () => {
    expect(estadoGeneral(critico, chequeosDeAislamiento(TODAS_EN_CERO))).toBe("critical");
  });
  it("warning si algún negocio está en warning y nada es crítico", () => {
    const aviso = [{ ...sano[0], status: "warning" as const }];
    expect(estadoGeneral(aviso, chequeosDeAislamiento(TODAS_EN_CERO))).toBe("warning");
  });
});
