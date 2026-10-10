/**
 * Qué pedidos ve Pedidos y reparto (`components/admin/OrdersTab/filtrar-pedidos.ts`).
 * El cálculo salió del render de OrdersTab al pasar la pestaña a vistas
 * (tablero · lista · archivados): estas pruebas fijan las reglas de antes para
 * que el tablero y la lista sigan diciendo lo mismo.
 */
import { describe, expect, it } from "vitest";
import type { DbOrder, OrderStatus } from "@/lib/jsondb";
import type { OrderFilters } from "@/components/admin/OrdersTab/types";
import {
  archivadosQuePasan,
  cuantosPorEstado,
  diaDelPedido,
  esArchivado,
  filtrosPuestos,
  pedidosArchivados,
  pedidosEnMarcha,
  repartidoresConPedidos,
} from "@/components/admin/OrdersTab/filtrar-pedidos";

const sinFiltros = (): OrderFilters => ({
  statuses: new Set<OrderStatus>(),
  paymentMethod: "",
  source: "",
  dateFrom: "",
  dateTo: "",
  amountMin: "",
  amountMax: "",
  customerSearch: "",
  hasDebt: false,
  hasAdminNotes: false,
});

let n = 0;
function pedido(extra: Partial<DbOrder> & Record<string, unknown> = {}): DbOrder {
  n += 1;
  return {
    id: `ord-${n}-abcdef`,
    status: "pendiente",
    paymentMethod: "yape",
    total: 50,
    createdAt: "2026-10-10T15:00:00.000Z",
    items: [],
    customer: { name: "Rosa Pérez", phone: "987654321", location: "Jr. Tacna 123" },
    ...extra,
  } as unknown as DbOrder;
}

describe("pedidos en marcha", () => {
  const lote = [
    pedido({ status: "pendiente", total: 20 }),
    pedido({ status: "confirmado", paymentMethod: "efectivo", total: 80, deliveryDriver: "Juan" }),
    pedido({ status: "en_camino", total: 120, deuda: true, source: "marketplace", deliveryDriver: "Ana" }),
    pedido({ status: "entregado" }),
    pedido({ status: "cancelado" }),
  ];

  it("sin filtros deja afuera entregados y cancelados", () => {
    expect(pedidosEnMarcha(lote, sinFiltros(), "")).toHaveLength(3);
    expect(pedidosArchivados(lote).map((o) => o.status)).toEqual(["entregado", "cancelado"]);
    expect(esArchivado({ status: "preparando" })).toBe(false);
  });

  it("estado, pago, repartidor, deuda y origen filtran como antes", () => {
    expect(pedidosEnMarcha(lote, { ...sinFiltros(), statuses: new Set(["confirmado"]) }, "")).toHaveLength(1);
    expect(pedidosEnMarcha(lote, { ...sinFiltros(), paymentMethod: "efectivo" }, "")).toHaveLength(1);
    expect(pedidosEnMarcha(lote, sinFiltros(), "Ana")).toHaveLength(1);
    expect(pedidosEnMarcha(lote, { ...sinFiltros(), hasDebt: true }, "")).toHaveLength(1);
    // `source` ausente cuenta como «direct» (Tienda personal).
    expect(pedidosEnMarcha(lote, { ...sinFiltros(), source: "direct" }, "")).toHaveLength(2);
  });

  it("montos inclusivos y monto inválido = sin filtro", () => {
    expect(pedidosEnMarcha(lote, { ...sinFiltros(), amountMin: "80" }, "")).toHaveLength(2);
    expect(pedidosEnMarcha(lote, { ...sinFiltros(), amountMax: "80" }, "")).toHaveLength(2);
    expect(pedidosEnMarcha(lote, { ...sinFiltros(), amountMin: "abc" }, "")).toHaveLength(3);
  });

  it("busca por nombre, teléfono o número de pedido", () => {
    const uno = [pedido({ customer: { name: "Pedro Ríos", phone: "999111222" } as DbOrder["customer"] })];
    expect(pedidosEnMarcha(uno, { ...sinFiltros(), customerSearch: "pedro" }, "")).toHaveLength(1);
    expect(pedidosEnMarcha(uno, { ...sinFiltros(), customerSearch: "111" }, "")).toHaveLength(1);
    expect(pedidosEnMarcha(uno, { ...sinFiltros(), customerSearch: uno[0].id.slice(-6) }, "")).toHaveLength(1);
    expect(pedidosEnMarcha(uno, { ...sinFiltros(), customerSearch: "zzz" }, "")).toHaveLength(0);
  });

  it("fecha por el día de Lima del pedido", () => {
    const f = { ...sinFiltros(), dateFrom: "2026-10-10", dateTo: "2026-10-10" };
    expect(pedidosEnMarcha(lote, f, "")).toHaveLength(3);
    expect(pedidosEnMarcha(lote, { ...f, dateFrom: "2026-10-11", dateTo: "" }, "")).toHaveLength(0);
  });

  it("un pedido de las 20:00 de Pucallpa es de ese día, no del siguiente (UTC)", () => {
    // 2026-10-11T01:00Z = sábado 10/10 a las 20:00 en Lima.
    const deNoche = [pedido({ createdAt: "2026-10-11T01:00:00.000Z" })];
    expect(diaDelPedido(deNoche[0])).toBe("2026-10-10");
    expect(pedidosEnMarcha(deNoche, { ...sinFiltros(), dateFrom: "2026-10-10", dateTo: "2026-10-10" }, "")).toHaveLength(1);
    expect(pedidosEnMarcha(deNoche, { ...sinFiltros(), dateFrom: "2026-10-11", dateTo: "" }, "")).toHaveLength(0);
  });
});

describe("Archivados", () => {
  const archivo = [
    pedido({ status: "entregado", createdAt: "2026-10-09T15:00:00.000Z" }),
    pedido({ status: "cancelado", createdAt: "2026-10-11T02:00:00.000Z", customer: { name: "Marta Ruiz", phone: "999888777" } as DbOrder["customer"] }),
  ];

  it("busca por cliente o teléfono y filtra por el día de Lima", () => {
    expect(archivadosQuePasan(archivo, { texto: "", desde: null, hasta: null })).toHaveLength(2);
    expect(archivadosQuePasan(archivo, { texto: "marta", desde: null, hasta: null })).toHaveLength(1);
    expect(archivadosQuePasan(archivo, { texto: "888", desde: null, hasta: null })).toHaveLength(1);
    // El cancelado es del 10/10 a las 21:00 en Lima, aunque en UTC ya sea 11.
    expect(archivadosQuePasan(archivo, { texto: "", desde: "2026-10-10", hasta: "2026-10-10" })).toHaveLength(1);
    expect(archivadosQuePasan(archivo, { texto: "", desde: null, hasta: "2026-10-09" })).toHaveLength(1);
  });
});

describe("conteos de la barra", () => {
  it("repartidores por nombre con su cantidad y estados en marcha en orden", () => {
    const lote = [
      pedido({ deliveryDriver: "Zoe" }),
      pedido({ deliveryDriver: "Ana" }),
      pedido({ deliveryDriver: "Ana", status: "en_camino" }),
    ];
    expect(repartidoresConPedidos(lote)).toEqual([
      { value: "Ana", count: 2 },
      { value: "Zoe", count: 1 },
    ]);
    expect(cuantosPorEstado(lote)).toEqual([
      { value: "pendiente", count: 2 },
      { value: "confirmado", count: 0 },
      { value: "preparando", count: 0 },
      { value: "en_camino", count: 1 },
    ]);
  });

  it("cuenta los filtros puestos, el repartidor incluido", () => {
    expect(filtrosPuestos(sinFiltros(), "")).toBe(0);
    expect(filtrosPuestos({ ...sinFiltros(), statuses: new Set(["pendiente", "confirmado"]), hasDebt: true }, "Ana")).toBe(4);
  });
});
