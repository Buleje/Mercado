/**
 * OrdersTab — Fase 2 de "Filtros en la cabecera tipo Excel" (2026-09-22).
 *
 * OrdersTab NO tiene tabla: es un kanban por estado (`OrdersKanban`), la
 * única `<DataTable>` del archivo es el resumen que sólo se ve al imprimir
 * (`hidden print:block`). No hay `<thead>` que fusionar con el modal "Filtros
 * Avanzados" — se dejó intacto (memoria del reporte de esta fase).
 *
 * Lo que sí se hizo: "Método de pago" pasó del modal, donde había que abrir
 * un diálogo para algo tan frecuente como "¿cuánto entró por Yape?", al
 * toolbar de siempre — mismo estado (`filters.paymentMethod`) que ya escribía
 * el modal, no un filtro nuevo. Este test corto prueba sólo eso.
 */
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

// SSE no existe en jsdom — stub mínimo, el hook sólo necesita poder
// suscribirse y cerrarse sin tirar.
class FakeEventSource {
  addEventListener() {}
  close() {}
}
vi.stubGlobal("EventSource", FakeEventSource);

import OrdersTab from "@/components/admin/OrdersTab";

const PEDIDO_YAPE = {
  id: "o-yape-1",
  customer: { name: "Cliente Yape", phone: "911111111", location: "", reference: "" },
  items: [{ id: 1, name: "Arroz", price: 5, quantity: 1, unit: "kg", image: "" }],
  total: 5,
  status: "pendiente",
  paymentMethod: "yape",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
const PEDIDO_EFECTIVO = {
  id: "o-efectivo-1",
  customer: { name: "Cliente Efectivo", phone: "922222222", location: "", reference: "" },
  items: [{ id: 1, name: "Gaseosa", price: 6, quantity: 1, unit: "und", image: "" }],
  total: 6,
  status: "pendiente",
  paymentMethod: "efectivo",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Yape pero ya CONFIRMADO: para probar que Estado (chips) y Método de pago
// (chips) cierran en AND — antes el método de pago sólo vivía en el modal.
const PEDIDO_YAPE_CONFIRMADO = {
  ...PEDIDO_YAPE,
  id: "o-yape-2",
  customer: { ...PEDIDO_YAPE.customer, name: "Cliente Yape Confirmado", phone: "933333333" },
  status: "confirmado",
};

type Pendiente = { url: string; resolver: (cuerpo: unknown, headers?: Record<string, string>) => void };
let pendientes: Pendiente[] = [];

beforeEach(() => {
  pendientes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise((resolve) => {
          pendientes.push({
            url,
            resolver: (cuerpo, headers = {}) =>
              resolve({ ok: true, status: 200, json: async () => cuerpo, headers: { get: (k: string) => headers[k] ?? null } }),
          });
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const pedido = (url: string) => pendientes.find((p) => p.url.startsWith(url));

async function resolver(url: string, cuerpo: unknown, headers?: Record<string, string>) {
  const p = pedido(url);
  if (!p) throw new Error(`sin pedido a ${url} todavía`);
  await act(async () => {
    p.resolver(cuerpo, headers);
  });
}

async function montar() {
  render(<OrdersTab />);
  await waitFor(() => expect(pedido("/api/orders")).toBeTruthy());
  await resolver("/api/orders", [PEDIDO_YAPE, PEDIDO_EFECTIVO, PEDIDO_YAPE_CONFIRMADO], { "X-Next-Cursor": "" });
  await waitFor(() => expect(pedido("/api/settings")).toBeTruthy());
  await resolver("/api/settings", {});
  // El kanban se dibuja dos veces (mobile `lg:hidden` + desktop `hidden
  // lg:grid`, mismo patrón dual-render que las tablas): basta con que
  // aparezca al menos una vez.
  await waitFor(() => expect(screen.getAllByText("Cliente Yape").length).toBeGreaterThan(0));
}

describe("OrdersTab — Método de pago promovido al toolbar", () => {
  it("filtra el kanban por método de pago con el mismo estado del modal", async () => {
    await montar();
    expect(screen.getAllByText("Cliente Efectivo").length).toBeGreaterThan(0);

    await act(async () => {
      screen.getByRole("button", { name: "Yape" }).click();
    });

    expect(screen.getAllByText("Cliente Yape").length).toBeGreaterThan(0);
    expect(screen.queryByText("Cliente Efectivo")).toBeNull();

    // El badge del botón "Filtros" (activeFiltersCount) cuenta el mismo estado.
    const botonFiltros = screen.getByRole("button", { name: /Filtros/ });
    expect(botonFiltros.textContent).toContain("1");
  });

  it("combina Estado (chip Pendientes) + Método de pago (chip Yape) en AND", async () => {
    await montar();
    expect(screen.getAllByText("Cliente Yape Confirmado").length).toBeGreaterThan(0);

    await act(async () => {
      screen.getByRole("button", { name: /^Pendientes/ }).click();
    });
    // Pendientes: se van los confirmados, quedan yape + efectivo pendientes.
    expect(screen.queryByText("Cliente Yape Confirmado")).toBeNull();
    expect(screen.getAllByText("Cliente Efectivo").length).toBeGreaterThan(0);

    await act(async () => {
      screen.getByRole("button", { name: "Yape" }).click();
    });
    // + Yape: sólo el pendiente pagado con Yape.
    expect(screen.getAllByText("Cliente Yape").length).toBeGreaterThan(0);
    expect(screen.queryByText("Cliente Efectivo")).toBeNull();
    expect(screen.queryByText("Cliente Yape Confirmado")).toBeNull();
    // Dos filtros puestos → el badge de «Filtros» dice 2.
    expect(screen.getByRole("button", { name: /Filtros/ }).textContent).toContain("2");
  });
});
