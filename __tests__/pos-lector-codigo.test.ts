import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { esCodigoDeBarras, resolverEnter, usePOSLectorCodigo } from "@/components/admin/pos/usePOSLectorCodigo";
import type { Product } from "@/components/admin/pos/pos-shared";

const p = (id: number, name: string, barcode?: string, stock?: number) =>
  ({ id, name, barcode, stock, price: 1, image: "", unit: "und", category: "", active: true, description: "" }) as Product;

const catalogo = [
  p(1, "Leche Gloria 400g", "7751271001001", 10),
  p(2, "Arroz Costeño 5kg", "7751271001002", 0),
  p(3, "Pan 7 semillas", "7751271009999", 5),
];

describe("Enter del buscador del POS (lector de código)", () => {
  it("reconoce un código: sólo dígitos, 6 o más", () => {
    expect(esCodigoDeBarras("7751271001001")).toBe(true);
    expect(esCodigoDeBarras("12345")).toBe(false);
    expect(esCodigoDeBarras("leche")).toBe(false);
    expect(esCodigoDeBarras("7 semillas")).toBe(false);
  });

  it("un código busca EXACTO (no el primero que lo contiene)", () => {
    expect(resolverEnter(catalogo, "7751271001001")).toEqual({ tipo: "codigo", codigo: "7751271001001", producto: catalogo[0] });
  });

  it("un código que no está devuelve el código para avisar", () => {
    expect(resolverEnter(catalogo, " 9990001112223 ")).toEqual({ tipo: "codigo", codigo: "9990001112223", producto: null });
  });

  it("dos lecturas pegadas ya no matchean nada: por eso se vacía el buscador tras cada una", () => {
    const pegadas = "7751271001001" + "7751271001001";
    expect(resolverEnter(catalogo, pegadas)).toMatchObject({ tipo: "codigo", producto: null });
  });

  it("un nombre agrega el primero vendible (salta los agotados)", () => {
    expect(resolverEnter(catalogo, "arroz")).toEqual({ tipo: "nombre", producto: null });
    expect(resolverEnter(catalogo, "7 sem")).toEqual({ tipo: "nombre", producto: catalogo[2] });
  });

  it("un código a medias escrito a mano encuentra el producto como antes (salta los agotados)", () => {
    expect(resolverEnter(catalogo, "1009999")).toEqual({ tipo: "codigo", codigo: "1009999", producto: catalogo[2] });
    expect(resolverEnter(catalogo, "1001002")).toEqual({ tipo: "codigo", codigo: "1001002", producto: null });
  });

  it("vacío no hace nada", () => {
    expect(resolverEnter(catalogo, "   ")).toBeNull();
  });
});

describe("Enter del buscador en el mostrador (hook)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  /** El buscador real (POSSearchBar) es controlado: escucha el evento input para enterarse del vaciado. */
  function buscador() {
    const input = document.createElement("input");
    input.setAttribute("data-pos-search", "");
    document.body.appendChild(input);
    const eventosInput = vi.fn();
    input.addEventListener("input", eventosInput);
    return { input, eventosInput };
  }

  it("dos lecturas seguidas: cada una agrega y deja el buscador vacío para la siguiente", () => {
    const { input, eventosInput } = buscador();
    const addToCart = vi.fn();
    const playError = vi.fn();
    const { result } = renderHook(() => usePOSLectorCodigo({ products: catalogo, addToCart, playError }));
    for (let i = 0; i < 2; i++) {
      input.value = "7751271001001"; // el lector escribe el código y manda Enter
      act(() => result.current.handleAddTopResult());
      expect(input.value).toBe("");
    }
    expect(addToCart).toHaveBeenCalledTimes(2);
    expect(addToCart).toHaveBeenNthCalledWith(2, catalogo[0]);
    expect(eventosInput).toHaveBeenCalledTimes(2);
    expect(playError).not.toHaveBeenCalled();
  });

  it("un código que no está suena, avisa y también vacía", () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve(null) })));
    const { input } = buscador();
    const addToCart = vi.fn();
    const playError = vi.fn();
    const { result } = renderHook(() => usePOSLectorCodigo({ products: catalogo, addToCart, playError }));
    input.value = "9990001112223";
    act(() => result.current.handleAddTopResult());
    expect(input.value).toBe("");
    expect(addToCart).not.toHaveBeenCalled();
    expect(playError).toHaveBeenCalledTimes(1);
  });

  it("un nombre agrega pero no borra lo escrito (se puede seguir buscando)", () => {
    const { input } = buscador();
    const addToCart = vi.fn();
    const { result } = renderHook(() => usePOSLectorCodigo({ products: catalogo, addToCart, playError: vi.fn() }));
    input.value = "leche";
    act(() => result.current.handleAddTopResult());
    expect(addToCart).toHaveBeenCalledWith(catalogo[0]);
    expect(input.value).toBe("leche");
  });
});
