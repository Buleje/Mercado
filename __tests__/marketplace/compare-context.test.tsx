/**
 * Tests unitarios — compare-context
 *
 * Cubre:
 *  1. add agrega un item
 *  2. add con 3 items no agrega el 4to (retorna false)
 *  3. remove quita un item por productId
 *  4. has retorna true si el item existe, false si no
 *  5. clear deja la lista vacia
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { CompareProvider, useCompare, type CompareItem } from "@/contexts/compare-context";
import type { ReactNode } from "react";

const wrapper = ({ children }: { children: ReactNode }) => (
  <CompareProvider>{children}</CompareProvider>
);

beforeEach(() => {
  localStorage.clear();
});

const makeItem = (id: number, name = `Producto ${id}`): CompareItem => ({
  id,
  productId: id,
  storeSlug: `tienda-${id}`,
  name,
  category: "abarrotes",
  unit: "und",
  price: 10 * id,
  image: "",
});

describe("useCompare", () => {
  it("add agrega un item a la lista", () => {
    const { result } = renderHook(() => useCompare(), { wrapper });

    act(() => {
      result.current.add(makeItem(1));
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].productId).toBe(1);
  });

  it("add con 4 items ya no agrega el 5to (MAX=4, silent no-op)", () => {
    const { result } = renderHook(() => useCompare(), { wrapper });

    act(() => {
      result.current.add(makeItem(1));
      result.current.add(makeItem(2));
      result.current.add(makeItem(3));
      result.current.add(makeItem(4));
    });

    expect(result.current.items).toHaveLength(4);

    act(() => {
      result.current.add(makeItem(5));
    });

    // add es void — si ya hay MAX items (4), no agrega (silent no-op)
    expect(result.current.items).toHaveLength(4);
    expect(result.current.items.map((i) => i.productId)).not.toContain(5);
  });

  it("remove quita un item por productId", () => {
    const { result } = renderHook(() => useCompare(), { wrapper });

    act(() => {
      result.current.add(makeItem(1));
      result.current.add(makeItem(2));
    });

    act(() => {
      result.current.remove(1);
    });

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0].productId).toBe(2);
  });

  it("has retorna true si el item esta en la lista, false si no", () => {
    const { result } = renderHook(() => useCompare(), { wrapper });

    act(() => {
      result.current.add(makeItem(5));
    });

    expect(result.current.has(5)).toBe(true);
    expect(result.current.has(99)).toBe(false);
  });

  it("clear deja la lista vacia", () => {
    const { result } = renderHook(() => useCompare(), { wrapper });

    act(() => {
      result.current.add(makeItem(1));
      result.current.add(makeItem(2));
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.items).toHaveLength(0);
  });
});
