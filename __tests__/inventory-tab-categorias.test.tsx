/**
 * Productos y stock — categorías del catálogo unido (10-10).
 *
 * `GET /api/admin/categorias` une la lista de Ajustes con los textos de
 * `Product.category`. Acá: (1) «abarrotes» y «Abarrotes» son UNA opción del
 * filtro, con el nombre del catálogo; (2) el formulario de alta MUESTRA el
 * nombre y GUARDA el texto que ya usan los productos («servicios-de-salon»,
 * como «madera-aserrada» en Blas: la tienda agrupa por ese texto tal cual), y
 * no ofrece las categorías ocultas.
 */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/csrf-client", () => ({ csrfHeaders: (h: Record<string, string> = {}) => h }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/admin/shared/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: async () => true }) }));
vi.mock("@/components/admin/shared/UndoToast", () => ({ useUndoToast: () => ({ showUndo: vi.fn() }) }));

import InventoryTab from "@/components/admin/InventoryTab";
import { claveCategoria, normalizarCategoria, textoDeCategoria } from "@/components/admin/inventario/inventario-compartido";

const ARROZ = { id: 1, name: "Arroz extra", category: "Abarrotes", price: 5, stock: 40, stockMin: 5, active: true, unit: "kg", image: "" };
const FIDEOS = { id: 2, name: "Fideos", category: "abarrotes", price: 3, stock: 20, stockMin: 5, active: true, unit: "und", image: "" };
const CREMA = { id: 3, name: "Crema", category: "servicios-de-salon", price: 30, stock: 9, stockMin: 1, active: true, unit: "und", image: "" };

const CATALOGO = [
  { id: "abarrotes", label: "Abarrotes", visible: true, valores: ["Abarrotes", "abarrotes"], productos: 2, activos: 2, guardada: true, order: 0, emoji: "" },
  { id: "servicios-de-salon", label: "Servicios de salón", visible: true, valores: ["servicios-de-salon"], productos: 1, activos: 1, guardada: true, order: 1, emoji: "" },
  { id: "temporada", label: "Temporada", visible: false, valores: [], productos: 0, activos: 0, guardada: true, order: 2, emoji: "" },
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

const pedido = (url: string) => pendientes.find((p) => p.url === url);

async function resolver(url: string, cuerpo: unknown) {
  const p = pedido(url);
  if (!p) throw new Error(`sin pedido a ${url} todavía`);
  await act(async () => {
    p.resolver(cuerpo);
  });
}

async function montar() {
  render(<InventoryTab />);
  await waitFor(() => expect(pedido("/api/products")).toBeTruthy());
  await waitFor(() => expect(pedido("/api/admin/categorias")).toBeTruthy());
  await resolver("/api/admin/categorias", { categorias: CATALOGO });
  if (pedido("/api/settings")) await resolver("/api/settings", {});
  await resolver("/api/products", [ARROZ, FIDEOS, CREMA]);
  await resolver("/api/inventory-movements", []);
  await waitFor(() => expect(within(screen.getByRole("table")).getByText("Arroz extra")).toBeTruthy());
}

describe("categorías de Productos y stock", () => {
  it("compara sin mayúsculas ni tildes", () => {
    expect(normalizarCategoria("Servicios De Salón")).toBe("servicios-de-salon");
    expect(claveCategoria("ABARROTES ")).toBe(claveCategoria("abarrotes"));
    expect(claveCategoria("")).toBe("otros");
  });

  it("el texto guardable es el que más usan los productos, no el nombre bonito", () => {
    const madera = { id: "madera-aserrada", label: "Madera aserrada", valores: ["madera-aserrada"] };
    const blas = [{ category: "madera-aserrada" }, { category: "madera-aserrada" }, { category: "madera-aserrada" }, { category: "Tablas" }];
    expect(textoDeCategoria(madera, blas)).toBe("madera-aserrada");
    expect(textoDeCategoria({ id: "bebidas", label: "Bebidas", valores: ["bebidas", "Bebidas"] }, [{ category: "bebidas" }, { category: "bebidas" }, { category: "Bebidas" }])).toBe("bebidas");
    // Sin productos: lo que guardaba el formulario de antes (su id de Ajustes).
    expect(textoDeCategoria({ id: "temporada", label: "Temporada", valores: [] }, [])).toBe("temporada");
  });

  it("«abarrotes» y «Abarrotes» son una sola opción del filtro, con el nombre del catálogo", async () => {
    await montar();
    fireEvent.click(screen.getByLabelText(/Filtrar por Categoría/));
    const grupo = screen.getByRole("group", { name: "Valores de Categoría" });
    const opciones = within(grupo).getAllByRole("checkbox").map((c) => c.getAttribute("aria-label"));
    expect(opciones).toEqual(["Categoría: Abarrotes", "Categoría: Servicios de salón"]);
    fireEvent.click(within(grupo).getByLabelText("Categoría: Abarrotes"));
    const tabla = within(screen.getByRole("table"));
    expect(tabla.getByText("Arroz extra")).toBeTruthy();
    expect(tabla.getByText("Fideos")).toBeTruthy();
    expect(tabla.queryByText("Crema")).toBeNull();
  });

  it("el alta guarda el texto de los productos, muestra el nombre y no ofrece las ocultas", async () => {
    await montar();
    fireEvent.click(screen.getByRole("button", { name: /^Nuevo$/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Crear nuevo/ }));
    const etiqueta = await screen.findByText("Categoría *");
    const select = etiqueta.closest("div")?.parentElement?.querySelector("select") ?? document.querySelector("form select");
    expect(select).toBeTruthy();
    const opciones = [...(select as HTMLSelectElement).options].map((o) => [o.value, o.textContent]);
    expect(opciones).toEqual([
      ["Abarrotes", "Abarrotes"],
      ["servicios-de-salon", "Servicios de salón"],
    ]);
    expect((select as HTMLSelectElement).value).toBe("Abarrotes");
  });
});
