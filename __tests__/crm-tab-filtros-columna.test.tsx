/**
 * CRMTab — Fase 2 de "Filtros en la cabecera tipo Excel" (2026-09-22).
 *
 * Corto a propósito: sólo prueba el autofiltro de Segmento y que Crédito
 * (rango) + Actividad ("Último pedido") cierran en AND — antes eran las tres
 * ramas excluyentes de un solo `quickFilter`, ahora son dos columnas
 * independientes con el mismo atajo de pastillas por arriba.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import CRMTab from "@/components/admin/CRMTab";

const hace = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString();

const FRECUENTE = { phone: "911111111", name: "Frecuente Feliz", creditBalance: 0 };
const NUEVO_CON_DEUDA = { phone: "922222222", name: "Nuevo Nato", creditBalance: 50 };
const OCASIONAL_ACTIVO_CON_DEUDA = { phone: "944444444", name: "Deudor Activo", creditBalance: 80 };

// Órdenes: Frecuente compra 6 veces reciente (frecuente+activo); el deudor
// activo compra 2 veces reciente (ocasional+activo); Nuevo Nato no compra.
const ORDENES = [
  ...Array.from({ length: 6 }, () => ({ customerPhone: FRECUENTE.phone, createdAt: hace(1) })),
  ...Array.from({ length: 2 }, () => ({ customerPhone: OCASIONAL_ACTIVO_CON_DEUDA.phone, createdAt: hace(2) })),
];

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
  await resolver("/api/customers", [FRECUENTE, NUEVO_CON_DEUDA, OCASIONAL_ACTIVO_CON_DEUDA]);
  await resolver("/api/orders", ORDENES);
  await resolver("/api/sales", []);
  await waitFor(() => expect(tabla().getByText("Frecuente Feliz")).toBeTruthy());
}

describe("CRMTab — autofiltro de cabecera (Segmento, Crédito, Actividad)", () => {
  it("filtra por Segmento desde el <th>", async () => {
    await montar();
    expect(tabla().getByText("Nuevo Nato")).toBeTruthy();

    fireEvent.click(tabla().getByLabelText(/Filtrar por Segmento/));
    const popover = tabla().getByRole("group", { name: "Valores de Segmento" });
    fireEvent.click(within(popover).getByLabelText("Segmento: Frecuente"));

    expect(tabla().getByText("Frecuente Feliz")).toBeTruthy();
    expect(tabla().queryByText("Nuevo Nato")).toBeNull();
    expect(tabla().queryByText("Deudor Activo")).toBeNull();
  });

  it("combina Crédito (rango) + Actividad en AND — antes era un solo quickFilter excluyente", async () => {
    await montar();

    // Crédito >= 1: deja a los dos con deuda.
    fireEvent.click(tabla().getByLabelText("Filtrar Crédito por rango"));
    fireEvent.change(tabla().getByLabelText("Crédito desde"), { target: { value: "1" } });
    await waitFor(() => expect(tabla().queryByText("Frecuente Feliz")).toBeNull());
    expect(tabla().getByText("Nuevo Nato")).toBeTruthy();
    expect(tabla().getByText("Deudor Activo")).toBeTruthy();

    // + Actividad = Activo: sólo queda el que además compró en los últimos 30 días.
    fireEvent.click(tabla().getByLabelText(/Filtrar por Último pedido/));
    fireEvent.click(within(tabla().getByRole("group", { name: "Valores de Último pedido" })).getByLabelText("Último pedido: Activo"));

    expect(tabla().queryByText("Nuevo Nato")).toBeNull();
    expect(tabla().getByText("Deudor Activo")).toBeTruthy();
  });
});
