/**
 * InventoryTab abre ya filtrado con `?filter=` (los avisos de Inicio llevan ahí): `critical` = stock bajo,
 * `expiring` = vence en 7 días. Fijado al partir InventoryTab en hooks + piezas (09-10): el efecto vive
 * ahora en `inventario/hooks/use-inventario-estado.ts` y la tabla en otra pieza.
 */
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/admin/shared/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: async () => true }) }));
vi.mock("@/components/admin/shared/UndoToast", () => ({ useUndoToast: () => ({ showUndo: vi.fn() }) }));

import InventoryTab from "@/components/admin/InventoryTab";

const en3 = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
const PRODUCTOS = [
  { id: 1, name: "Arroz extra", category: "Abarrotes", price: 5, stock: 40, stockMin: 5, active: true, unit: "kg", image: "", expiryDate: en3 },
  { id: 2, name: "Gaseosa 1L", category: "Bebidas", price: 6, stock: 3, stockMin: 5, active: true, unit: "und", image: "" },
  { id: 3, name: "Leche", category: "Lácteos", price: 4, stock: 0, stockMin: 2, active: true, unit: "und", image: "" },
  { id: 4, name: "Detergente", category: "Limpieza", price: 8, stock: 10, stockMin: 5, active: true, unit: "und", image: "" },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => (url === "/api/products" ? PRODUCTOS : url === "/api/settings" ? {} : []),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function filasCon(filtro: string) {
  window.history.replaceState(null, "", `/admin?tab=inventario&filter=${filtro}`);
  render(<InventoryTab />);
  await waitFor(() => expect(screen.getAllByText(/Mostrando/).length).toBeGreaterThan(0));
  const tabla = within(screen.getByRole("table"));
  return { tabla, url: window.location.search };
}

describe("InventoryTab — ?filter= de los avisos de Inicio", () => {
  it("critical deja sólo lo que está en o bajo el mínimo y consume el parámetro", async () => {
    const { tabla, url } = await filasCon("critical");
    expect(tabla.getByText("Gaseosa 1L")).toBeTruthy();
    expect(tabla.getByText("Leche")).toBeTruthy();
    expect(tabla.queryByText("Arroz extra")).toBeNull();
    expect(tabla.queryByText("Detergente")).toBeNull();
    expect(url).toBe("?tab=inventario");
  });

  it("expiring deja sólo lo que vence en los próximos 7 días", async () => {
    const { tabla } = await filasCon("expiring");
    expect(tabla.getByText("Arroz extra")).toBeTruthy();
    expect(tabla.queryByText("Gaseosa 1L")).toBeNull();
    expect(tabla.queryByText("Leche")).toBeNull();
  });
});
