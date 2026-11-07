import { describe, expect, it } from "vitest";
import { categoriasDe, mapearRespuesta, resumenPorCategoria } from "@/components/admin/inventario/conteo/declaracion-tipos";

const item = (id: string, stock: number, costPrice: number, price: number) => ({ id, sku: id, name: id, stock, costPrice, price, categoryName: "x" });

describe("declaración de inventario: mapeo y cuentas", () => {
  it("lee el formato plano y el anidado en `resumen`", () => {
    expect(mapearRespuesta({ fecha: "2026-10-10", totalProductos: 3, totalUnidades: 9, valorCosto: 50, valorPrecio: 80 })).toMatchObject({ totalProductos: 3, valorCosto: 50 });
    expect(mapearRespuesta({ fecha: "2026-10-10", resumen: { totalProductos: 2, totalUnidades: 4, totalValorCosto: 7, totalValorPrecio: 9 } })).toMatchObject({ totalProductos: 2, valorCosto: 7, valorPrecio: 9 });
  });

  it("suma unidades y valor a costo por categoría", () => {
    const d = mapearRespuesta({ fecha: "2026-10-10", porCategoria: { Abarrotes: [item("a", 2, 5, 8), item("b", 3, 1, 2)], Bebidas: [item("c", 1, 4, 6)] } });
    expect(Object.keys(categoriasDe(d))).toEqual(["Abarrotes", "Bebidas"]);
    expect(resumenPorCategoria(d)).toEqual({ Abarrotes: { unidades: 5, valorCosto: 13 }, Bebidas: { unidades: 1, valorCosto: 4 } });
  });
});
