/**
 * InventoryTab — Fase 2 de "Filtros en la cabecera tipo Excel" (2026-09-22).
 *
 * Corto a propósito: sólo prueba que el autofiltro de la cabecera (Categoría,
 * Estado) filtra la tabla y que combinar dos cierra en AND — el resto
 * (rangos, `enRango`, chips) ya está cubierto por
 * `__tests__/lib-admin-filtros-columna.test.ts`.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/admin/shared/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: async () => true }) }));
vi.mock("@/components/admin/shared/UndoToast", () => ({ useUndoToast: () => ({ showUndo: vi.fn() }) }));

import InventoryTab from "@/components/admin/InventoryTab";

// Categorías con MAYÚSCULA como las guarda la base real («Abarrotes»): el
// id del autofiltro es lowercase y, sin `claveCategoria` en los dos lados,
// elegir una categoría dejaba la tabla en cero (medido 2026-09-22).
const AROZ = { id: 1, name: "Arroz extra", category: "Abarrotes", price: 5, stock: 40, stockMin: 5, active: true, unit: "kg", image: "" };
const GASEOSA = { id: 2, name: "Gaseosa 1L", category: "Bebidas", price: 6, stock: 3, stockMin: 5, active: true, unit: "und", image: "" };
const VIEJO = { id: 3, name: "Detergente viejo", category: "Limpieza", price: 8, stock: 10, stockMin: 5, active: false, unit: "und", image: "" };

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

const pedido = (url: string) => pendientes.find((p) => p.url === url);

async function resolver(url: string, cuerpo: unknown) {
  const p = pedido(url);
  if (!p) throw new Error(`sin pedido a ${url} todavía`);
  await act(async () => {
    p.resolver(cuerpo);
  });
}

/** La tabla de escritorio: las mismas filas se repiten en cards para mobile
 *  (dual-render, ambos existen en jsdom) — acotar acá evita "multiple elements". */
function tabla() {
  return within(screen.getByRole("table"));
}

async function montarConProductos() {
  render(<InventoryTab />);
  await waitFor(() => expect(pedido("/api/settings")).toBeTruthy());
  await resolver("/api/settings", {});
  await waitFor(() => expect(pedido("/api/products")).toBeTruthy());
  await resolver("/api/products", [AROZ, GASEOSA, VIEJO]);
  await resolver("/api/inventory-movements", []);
  // "Detergente viejo" está inactivo: con el Estado por defecto ("Activo")
  // no se ve hasta que se lo pide desde la cabecera.
  await waitFor(() => expect(tabla().getByText("Arroz extra")).toBeTruthy());
}

describe("InventoryTab — autofiltro de cabecera (Categoría, Estado)", () => {
  it("filtra por Categoría desde el <th> y no toca lo que no matchea", async () => {
    await montarConProductos();
    expect(tabla().getByText("Gaseosa 1L")).toBeTruthy();

    const disparador = tabla().getByLabelText(/Filtrar por Categoría/);
    fireEvent.click(disparador);
    const popover = tabla().getByRole("group", { name: "Valores de Categoría" });
    fireEvent.click(within(popover).getByLabelText(/Categoría: Abarrotes|Categoría: abarrotes/i));

    expect(tabla().getByText("Arroz extra")).toBeTruthy();
    expect(tabla().queryByText("Gaseosa 1L")).toBeNull();
  });

  it("combina Categoría + Estado en AND (Brandon, 2026-09-03/22)", async () => {
    await montarConProductos();

    // Pedir también los inactivos desde la columna Estado.
    const disparadorEstado = tabla().getByLabelText(/Filtrar por Estado/);
    fireEvent.click(disparadorEstado);
    const popoverEstado = tabla().getByRole("group", { name: "Valores de Estado" });
    fireEvent.click(within(popoverEstado).getByLabelText("Estado: Inactivo"));
    await waitFor(() => expect(tabla().getByText("Detergente viejo")).toBeTruthy());

    // Ahora acotar también por Categoría=limpieza: sólo debe quedar el inactivo de limpieza.
    const disparadorCat = tabla().getByLabelText(/Filtrar por Categoría/);
    fireEvent.click(disparadorCat);
    const popoverCat = tabla().getByRole("group", { name: "Valores de Categoría" });
    fireEvent.click(within(popoverCat).getByLabelText(/Categoría: Limpieza|Categoría: limpieza/i));

    expect(tabla().getByText("Detergente viejo")).toBeTruthy();
    expect(tabla().queryByText("Arroz extra")).toBeNull();
    expect(tabla().queryByText("Gaseosa 1L")).toBeNull();
  });
});
