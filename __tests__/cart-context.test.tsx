import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { CartProvider, useCart } from "@/contexts/cart-context";
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
