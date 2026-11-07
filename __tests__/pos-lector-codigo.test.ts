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

describe("Códigos con letras y números cortos (10-10)", () => {
  const conLetras = [
    ...catalogo,
    { ...p(4, "Filtro de aceite", "ABC123X", 3), sku: "FIL-01" } as Product,
    p(5, "Galleta 123 Soda", "7751271001230", 9),
    p(6, "Clavo 2 pulgadas", "123", 40),
  ];

  it("un código alfanumérico en mayúsculas se encuentra exacto, lo lea como lo lea", () => {
    expect(resolverEnter(conLetras, "ABC123X")).toEqual({ tipo: "codigo", codigo: "ABC123X", producto: conLetras[3] });
    expect(resolverEnter(conLetras, "abc123x")).toMatchObject({ tipo: "codigo", producto: conLetras[3] });
  });

  it("el SKU también entra exacto, sin importar mayúsculas", () => {
    expect(resolverEnter(conLetras, "fil-01")).toMatchObject({ tipo: "codigo", producto: conLetras[3] });
  });

  it("un número corto sólo vale exacto: no agrega otro producto que lo contiene", () => {
    expect(resolverEnter(conLetras, "123")).toMatchObject({ tipo: "codigo", producto: conLetras[5] });
    // «12» está dentro de «Galleta 123 Soda», de «123» y de varios códigos: antes agregaba el primero de esos.
    expect(resolverEnter(conLetras, "12")).toEqual({ tipo: "codigo", codigo: "12", producto: null });
    expect(resolverEnter(catalogo, "1001")).toEqual({ tipo: "codigo", codigo: "1001", producto: null });
  });

  it("la cámara también encuentra el código con letras", () => {
    const addToCart = vi.fn();
    const { result } = renderHook(() => usePOSLectorCodigo({ products: conLetras, addToCart, playError: vi.fn() }));
    act(() => void result.current.handleBarcode("abc123x"));
    expect(addToCart).toHaveBeenCalledWith(conLetras[3]);
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

describe("código con letras: no agrega un pariente por coincidencia parcial (revisión 10-10)", () => {
  it("leer MU013 no agrega MU013-2 (paquete de 2) si el MU013 no está en la lista", () => {
    const soloPaquete = [p(9, "Sérum vitamina C x2", "MU013-2", 5)];
    expect(resolverEnter(soloPaquete, "MU013")?.producto ?? null).toBeNull();
  });
});
