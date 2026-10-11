/**
 * CRMTab — Mis clientes (10-10): filtros en UNA fila pegada a la tabla, sin
 * autofiltros en las cabeceras, y las compras contadas en el servidor.
 *
 * Antes eran tres filas de pastillas (Segmento · Estado · Frecuencia) y además
 * selects dentro de «Último pedido», «Crédito» y «Segmento» que escribían lo
 * mismo. «Total gastado» venía de `Customer.totalSpent`, que los pedidos no
 * mueven: S/ 0,00 con 9 pedidos. Ahora GET /api/customers?compras=1 trae
 * compras, gastado y las de 30 días; la lista ya no pide /api/orders ni /api/sales.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import CRMTab from "@/components/admin/CRMTab";

const hace = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString();

// Frecuente: 6 compras recientes (Semanal), sin deuda. Nuevo Nato: no compra y
// debe. Deudor Activo: 2 compras en 30 días (Quincenal) y debe.
const FRECUENTE = { phone: "911111111", name: "Frecuente Feliz", creditBalance: 0, totalSpent: 0, compras: 6, gastado: 120, cerradas: 6, ultimaCompra: hace(1), compras30d: 6 };
const NUEVO_CON_DEUDA = { phone: "922222222", name: "Nuevo Nato", creditBalance: 50, compras: 0, gastado: 0, cerradas: 0, ultimaCompra: null, compras30d: 0 };
const OCASIONAL_ACTIVO_CON_DEUDA = { phone: "944444444", name: "Deudor Activo", creditBalance: 80, compras: 2, gastado: 35.5, cerradas: 2, ultimaCompra: hace(2), compras30d: 2 };

type Pendiente = { url: string; resolver: (cuerpo: unknown) => void };
let pendientes: Pendiente[] = [];

beforeEach(() => {
  pendientes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(
      (url: string) =>
        new Promise((resolve) => {
          pendientes.push({ url, resolver: (cuerpo) => resolve({ ok: true, status: 200, json: async () => cuerpo }) });
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const pedido = (url: string) => pendientes.find((p) => p.url.startsWith(url));

async function resolver(url: string, cuerpo: unknown) {
  const p = pedido(url);
  if (!p) throw new Error(`sin pedido a ${url} todavía`);
  await act(async () => {
    p.resolver(cuerpo);
  });
}

function tabla() {
  return within(screen.getAllByRole("table")[0]);
}

async function montar() {
  render(<CRMTab />);
  await waitFor(() => expect(pedido("/api/customers")).toBeTruthy());
  await resolver("/api/customers", [NUEVO_CON_DEUDA, FRECUENTE, OCASIONAL_ACTIVO_CON_DEUDA]);
  await waitFor(() => expect(tabla().getByText("Frecuente Feliz")).toBeTruthy());
}

describe("CRMTab — Mis clientes", () => {
  it("pide las compras al servidor y nada más (sin /api/orders ni /api/sales)", async () => {
    await montar();
    expect(pendientes.map((p) => p.url)).toEqual(["/api/customers?limit=500&compras=1"]);
  });

  it("Total gastado sale de lo que compró, y el que más gastó va primero", async () => {
    await montar();
    expect(tabla().getByText("S/ 120.00")).toBeTruthy();
    expect(tabla().getByText("6 compras")).toBeTruthy();
    const filas = tabla().getAllByRole("row").slice(1).map((r) => r.textContent ?? "");
    expect(filas[0]).toContain("Frecuente Feliz");
    expect(filas[2]).toContain("Nuevo Nato");
  });

  it("sin filtros dentro de las cabeceras", async () => {
    await montar();
    const cabecera = tabla().getAllByRole("rowgroup")[0];
    expect(within(cabecera).queryAllByLabelText(/Filtrar/)).toHaveLength(0);
  });

  it("filtra por Segmento desde la fila de filtros", async () => {
    await montar();
    fireEvent.click(screen.getByLabelText(/Filtrar por Segmento/));
    const popover = screen.getByRole("group", { name: "Valores de Segmento" });
    fireEvent.click(within(popover).getByLabelText("Segmento: Frecuente"));
    expect(tabla().getByText("Frecuente Feliz")).toBeTruthy();
    expect(tabla().queryByText("Nuevo Nato")).toBeNull();
    expect(tabla().queryByText("Deudor Activo")).toBeNull();
  });

  it("Con deuda + compras de los últimos 30 días cierran en AND", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /Con deuda \(2\)/ }));
    await waitFor(() => expect(tabla().queryByText("Frecuente Feliz")).toBeNull());
    expect(tabla().getByText("Nuevo Nato")).toBeTruthy();
    expect(tabla().getByText("Deudor Activo")).toBeTruthy();

    fireEvent.click(screen.getByLabelText(/Filtrar por Compras en los últimos 30 días/));
    const popover = screen.getByRole("group", { name: "Valores de Compras en los últimos 30 días" });
    fireEvent.click(within(popover).getByLabelText("Compras en los últimos 30 días: Quincenal"));
    expect(tabla().queryByText("Nuevo Nato")).toBeNull();
    expect(tabla().getByText("Deudor Activo")).toBeTruthy();
  });
});
