/**
 * El P&L con la madera adentro.
 *
 * Desde que la guía de salida lleva precio, el estado de resultados tenía que
 * dejar de mirar sólo el mostrador. Lo que se prueba acá es lo que puede
 * mentir: que el total DIGA cuánto de él es madera, que avise de los despachos
 * sin precio —plata que salió y no figura— y que un tenant sin Libro CTP siga
 * viendo su P&L de siempre.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import PLTab from "@/components/admin/PLTab";

const mockFetch = vi.fn();

/** Un pedido entregado del mes en curso, para que el mostrador no sea cero. */
function pedidoDeHoy(total: number) {
  return { createdAt: new Date().toISOString(), status: "entregado", total };
}

function responder(pnl: Record<string, number> | null) {
  mockFetch.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/api/orders")) return Promise.resolve({ ok: true, json: async () => [pedidoDeHoy(1000)] });
    if (u.includes("/api/expenses")) return Promise.resolve({ ok: true, json: async () => [] });
    if (u.includes("pnl=1")) {
      /* Sin el Libro habilitado el endpoint contesta 403: el P&L no se rompe. */
      return pnl
        ? Promise.resolve({ ok: true, json: async () => ({ pnl }) })
        : Promise.resolve({ ok: false, status: 403, json: async () => ({ error: "specialization_disabled" }) });
    }
    return Promise.resolve({ ok: true, json: async () => [] });
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  globalThis.fetch = mockFetch as unknown as typeof fetch;
});
afterEach(() => vi.restoreAllMocks());

describe("el P&L dice cuánto de su total es madera", () => {
  it("suma la venta de madera y la muestra desglosada", async () => {
    responder({ ventasTotal: 5000, cogsTotal: 3000, margenTotal: 2000, sinVenta: 0, sinCosto: 0 });
    render(<PLTab />);

    expect(await screen.findByText(/de los cuales, madera despachada/)).toBeTruthy();
    /* 1.000 del mostrador + 5.000 de madera. */
    await waitFor(() => expect(screen.getAllByText(/6,000/).length).toBeGreaterThan(0));
  });

  it("avisa que el costo del mostrador es estimado y el de la madera real", async () => {
    responder({ ventasTotal: 5000, cogsTotal: 3000, margenTotal: 2000, sinVenta: 0, sinCosto: 0 });
    render(<PLTab />);
    expect(await screen.findByText(/mostrador ~55% estimado · madera con su costo real/)).toBeTruthy();
  });

  it("dice cuántos despachos salieron sin precio: esa plata no está sumada", async () => {
    responder({ ventasTotal: 5000, cogsTotal: 3000, margenTotal: 2000, sinVenta: 2, sinCosto: 1 });
    render(<PLTab />);
    expect(await screen.findByText(/2 despachos del mes\s+sin precio cargado/)).toBeTruthy();
    expect(screen.getByText(/1 con precio pero sin costo atribuido/)).toBeTruthy();
  });

  it("sin Libro CTP el P&L es el de siempre, sin línea de madera", async () => {
    responder(null);
    render(<PLTab />);
    expect(await screen.findByText(/~55% de ventas estimado/)).toBeTruthy();
    expect(screen.queryByText(/madera despachada/)).toBeNull();
  });

  it("con el Libro habilitado pero sin despachos tampoco agrega ruido", async () => {
    responder({ ventasTotal: 0, cogsTotal: 0, margenTotal: 0, sinVenta: 0, sinCosto: 0 });
    render(<PLTab />);
    expect(await screen.findByText(/~55% de ventas estimado/)).toBeTruthy();
    expect(screen.queryByText(/madera despachada/)).toBeNull();
  });
});
