/**
 * ReceivingTab — Fase 2 de "Filtros en la cabecera tipo Excel" (2026-09-22).
 *
 * Corto a propósito: sólo prueba que el autofiltro de Proveedor y Estado
 * filtran la tabla y que combinarlos cierra en AND — el resto (rangos,
 * `enRango`, chips) ya está cubierto por `lib-admin-filtros-columna.test.ts`.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));

import ReceivingTab from "@/components/admin/ReceivingTab";

const R1 = {
  id: "r1", ref: "REC-001", orderRef: "OC-1", supplier: "Distribuidora Pucallpa",
  scheduledDate: "2026-09-10", status: "programada", inspector: "Juan",
  items: [], photos: 0, nonConformities: 0,
};
const R2 = {
  id: "r2", ref: "REC-002", orderRef: "OC-2", supplier: "Molinera Pasco",
  scheduledDate: "2026-09-12", status: "aceptada", inspector: "Ana",
  items: [], photos: 0, nonConformities: 0,
};
const R3 = {
  id: "r3", ref: "REC-003", orderRef: "OC-3", supplier: "Molinera Pasco",
  scheduledDate: "2026-09-15", status: "rechazada", inspector: "Ana",
  items: [], photos: 0, nonConformities: 1,
};

type Pendiente = { url: string; resolver: (cuerpo: unknown) => void };
let pendientes: Pendiente[] = [];

beforeEach(() => {
  pendientes = [];
  try { localStorage.clear(); } catch { /* jsdom */ }
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

const pedido = (url: string) => pendientes.find((p) => p.url === url);

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
  render(<ReceivingTab />);
  await waitFor(() => expect(pedido("/api/compras/recepciones")).toBeTruthy());
  await resolver("/api/compras/recepciones", [R1, R2, R3]);
  await resolver("/api/products", []);
  await resolver("/api/suppliers", []);
  await waitFor(() => expect(tabla().getByText("REC-001")).toBeTruthy());
}

describe("ReceivingTab — autofiltro de cabecera (Proveedor, Estado)", () => {
  it("filtra por Proveedor desde el <th>", async () => {
    await montar();
    expect(tabla().getByText("REC-002")).toBeTruthy();

    fireEvent.click(tabla().getByLabelText(/Filtrar por Proveedor/));
    const popover = tabla().getByRole("group", { name: "Valores de Proveedor" });
    fireEvent.click(within(popover).getByLabelText("Proveedor: Molinera Pasco"));

    expect(tabla().queryByText("REC-001")).toBeNull();
    expect(tabla().getByText("REC-002")).toBeTruthy();
    expect(tabla().getByText("REC-003")).toBeTruthy();
  });

  it("combina Proveedor + Estado en AND", async () => {
    await montar();

    fireEvent.click(tabla().getByLabelText(/Filtrar por Proveedor/));
    fireEvent.click(within(tabla().getByRole("group", { name: "Valores de Proveedor" })).getByLabelText("Proveedor: Molinera Pasco"));
    await waitFor(() => expect(tabla().queryByText("REC-001")).toBeNull());

    fireEvent.click(tabla().getByLabelText(/Filtrar por Estado/));
    fireEvent.click(within(tabla().getByRole("group", { name: "Valores de Estado" })).getByLabelText("Estado: Rechazada"));

    expect(tabla().queryByText("REC-002")).toBeNull();
    expect(tabla().getByText("REC-003")).toBeTruthy();
  });
});
