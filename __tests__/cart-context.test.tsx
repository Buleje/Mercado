import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { CARRITO_NO_AGREGADO, CartProvider, useCart } from "@/contexts/cart-context";
import type { Product } from "@/data/products";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <CartProvider>{children}</CartProvider>
);

beforeEach(() => {
  localStorage.clear();
});

const apple: Product = {
  id: 1,
  name: "Manzana Roja",
  category: "frutas-verduras",
  price: 3.5,
  image: "/apple.jpg",
  unit: "kg",
};

const milk: Product = {
  id: 2,
  name: "Leche Fresca",
  category: "lacteos",
  price: 5.0,
  image: "/milk.jpg",
  unit: "litro",
};

describe("useCart", () => {
  it("empieza con carrito vacío", () => {
    const { result } = renderHook(() => useCart(), { wrapper });
    expect(result.current.items).toHaveLength(0);
    expect(result.current.count).toBe(0);
    expect(result.current.total).toBe(0);
  });

  it("agrega un producto al carrito", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => result.current.addItem(apple));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe("Manzana Roja");
    expect(result.current.count).toBe(1);
    expect(result.current.total).toBe(3.5);
  });

  it("incrementa cantidad al agregar el mismo producto", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => result.current.addItem(apple));
    act(() => result.current.addItem(apple));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].quantity).toBe(2);
    expect(result.current.count).toBe(2);
    expect(result.current.total).toBe(7.0);
  });

  it("agrega múltiples productos diferentes", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => result.current.addItem(apple));
    act(() => result.current.addItem(milk));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.count).toBe(2);
    expect(result.current.total).toBe(8.5);
  });

  it("elimina un producto del carrito", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => result.current.addItem(apple));
    act(() => result.current.addItem(milk));
    act(() => result.current.removeItem(1));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].name).toBe("Leche Fresca");
  });

  it("actualiza la cantidad de un producto", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => result.current.addItem(apple));
    act(() => result.current.updateQty(1, 5));

    expect(result.current.items[0].quantity).toBe(5);
    expect(result.current.total).toBe(17.5);
  });

  it("elimina producto si updateQty recibe qty <= 0", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => result.current.addItem(apple));
    act(() => result.current.updateQty(1, 0));

    expect(result.current.items).toHaveLength(0);
  });

  it("limpia todo el carrito con clear()", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => result.current.addItem(apple));
    act(() => result.current.addItem(milk));
    act(() => result.current.clear());

    expect(result.current.items).toHaveLength(0);
    expect(result.current.count).toBe(0);
    expect(result.current.total).toBe(0);
  });

  it("toggle abre y cierra el sidebar", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    expect(result.current.isOpen).toBe(false);
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.toggle());
    expect(result.current.isOpen).toBe(false);
  });

  it("open() y close() controlan el sidebar", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() => result.current.open());
    expect(result.current.isOpen).toBe(true);
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it("addMultiple agrega varios productos de una vez", () => {
    const { result } = renderHook(() => useCart(), { wrapper });

    act(() =>
      result.current.addMultiple([
        { product: apple, quantity: 3 },
        { product: milk, quantity: 2 },
      ])
    );

    expect(result.current.items).toHaveLength(2);
    expect(result.current.count).toBe(5);
    expect(result.current.total).toBe(3.5 * 3 + 5.0 * 2);
  });

  it("lanza error si useCart se usa fuera de CartProvider", () => {
    expect(() => {
      renderHook(() => useCart());
    }).toThrow("useCart must be inside CartProvider");
  });
});

/**
 * 16-10 (tienda Musa): con sesión de admin de OTRO negocio, /api/products
 * devolvía los productos del admin y `addItem` rechazaba en silencio todo lo de
 * la tienda (sólo un console.warn): el botón «Agregar» quedaba mudo.
 */
describe("addItem en una tienda /t/<slug>", () => {
  const tienda = ({ children }: { children: ReactNode }) => <CartProvider tenantSlug="musa">{children}</CartProvider>;

  function simularServidor(existentesEnLaTienda: number[]) {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("/api/products")) return new Response(JSON.stringify([{ id: 999 }]), { status: 200 }); // los del admin
      if (url.startsWith("/api/marketplace/products/check-exists")) {
        const ids = new URL(url, "http://x").searchParams.get("ids")!.split(",").map(Number);
        return new Response(JSON.stringify({ existingIds: ids.filter((i) => existentesEnLaTienda.includes(i)) }), { status: 200 });
      }
      return new Response("null", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  afterEach(() => vi.unstubAllGlobals());

  it("pide el set de la tienda como visitante (sin la sesión del admin)", async () => {
    const fetchMock = simularServidor([1]);
    renderHook(() => useCart(), { wrapper: tienda });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/products?active=true", expect.objectContaining({ credentials: "omit" })));
  });

  it("si el set no lo tiene, lo confirma por el slug de la tienda y lo agrega", async () => {
    const fetchMock = simularServidor([1]);
    const { result } = renderHook(() => useCart(), { wrapper: tienda });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {}); // el set (id 999) ya está cargado

    act(() => {
      result.current.addItem(apple);
      result.current.addItem(apple); // doble toque mientras confirma: uno solo
    });

    await waitFor(() => expect(result.current.count).toBe(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/marketplace/products/check-exists?ids=1&tenantSlug=musa", expect.anything());
    // Confirmado una vez, el siguiente entra directo (sin otra consulta).
    act(() => result.current.addItem(apple));
    expect(result.current.count).toBe(2);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes("check-exists"))).toHaveLength(1);
  });

  it("si no es de la tienda, no lo agrega y avisa con CARRITO_NO_AGREGADO", async () => {
    const fetchMock = simularServidor([]);
    const avisos: unknown[] = [];
    const oir = (e: Event) => avisos.push((e as CustomEvent).detail);
    window.addEventListener(CARRITO_NO_AGREGADO, oir);
    const { result } = renderHook(() => useCart(), { wrapper: tienda });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {});

    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    act(() => result.current.addItem(milk));
    await waitFor(() => expect(avisos).toEqual([{ id: 2, nombre: "Leche Fresca" }]));
    expect(result.current.count).toBe(0);
    warn.mockRestore();
    window.removeEventListener(CARRITO_NO_AGREGADO, oir);
  });
});
