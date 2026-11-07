import { describe, it, expect } from "vitest";
import { contarFaltas, productoConElCodigo, sugerirSinCodigo, margenDe, leerStockInicial, type ProductoDeLista } from "@/lib/inventario/lista-para-vender";
import { leFalta } from "@/lib/inventario/catalogo-incompleto";

const P = (o: Partial<ProductoDeLista> & { id: number; name: string }): ProductoDeLista => ({ active: true, stock: 5, costPrice: 2, barcode: "111111", ...o });

const catalogo: ProductoDeLista[] = [
  P({ id: 1, name: "Arroz Costeño" }),
  P({ id: 2, name: "Azúcar rubia", barcode: null }),
  P({ id: 3, name: "Aceite Primor", barcode: "", costPrice: null }),
  P({ id: 4, name: "Leche Gloria", stock: null, costPrice: 0 }),
  P({ id: 5, name: "Inactivo", active: false, barcode: null, costPrice: null, stock: null }),
  P({ id: 6, name: "Corte de pelo", type: "service", barcode: null, costPrice: null, stock: null }),
];

describe("lista para vender", () => {
  it("cuenta lo que falta sólo en activos y sin servicios", () => {
    expect(contarFaltas(catalogo)).toEqual({ sinCodigo: 2, sinCosto: 2, sinControl: 1 });
  });
  it("sin-control no incluye servicios", () => {
    expect(leFalta(catalogo[5], "sin-control")).toBe(false);
    expect(leFalta(catalogo[3], "sin-control")).toBe(true);
  });
  it("detecta el código repetido y nombra al dueño", () => {
    expect(productoConElCodigo(catalogo, " 111111 ")?.name).toBe("Arroz Costeño");
    expect(productoConElCodigo(catalogo, "111111", 1)?.id).toBe(4); // otro con el mismo código sigue contando
    expect(productoConElCodigo(catalogo, "999999")).toBeNull();
    expect(productoConElCodigo(catalogo, "  ")).toBeNull();
  });
  it("sugiere sólo sin código, sin tildes", () => {
    expect(sugerirSinCodigo(catalogo, "azucar").map((p) => p.id)).toEqual([2]);
    expect(sugerirSinCodigo(catalogo, "").map((p) => p.id)).toEqual([3, 2]);
    expect(sugerirSinCodigo(catalogo, "arroz")).toEqual([]);
  });
  it("asignar un código baja el contador 2 → 1", () => {
    const despues = catalogo.map((p) => (p.id === 2 ? { ...p, barcode: "777" } : p));
    expect(contarFaltas(despues).sinCodigo).toBe(1);
  });
  it("margen sobre el precio", () => {
    expect(margenDe(10, 700)).toBe(30);
    expect(margenDe("10.00", 250)).toBe(75);
    expect(margenDe(0, 100)).toBeNull();
    expect(margenDe(10, null)).toBeNull();
  });
  it("stock inicial", () => {
    expect(leerStockInicial("12")).toEqual({ ok: true, cantidad: 12 });
    expect(leerStockInicial("0")).toEqual({ ok: true, cantidad: 0 });
    expect(leerStockInicial("").ok).toBe(false);
    expect(leerStockInicial("-3").ok).toBe(false);
    expect(leerStockInicial("2.5").ok).toBe(false);
  });
});
