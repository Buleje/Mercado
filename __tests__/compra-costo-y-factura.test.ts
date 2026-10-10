/**
 * Punto de compra (09-10): el costo nunca cae al precio de venta y la factura
 * escaneada se empareja por el MEJOR puntaje, no por el primero que contenga
 * el texto («Arroz» caía en cualquier arroz).
 */
import { describe, expect, it } from "vitest";
import { costoDe, costoSugerido, historialConCompra, historialDesdeOrdenes, itemsSinCosto, conCostoEfectivo } from "@/components/admin/compra/costo-compra";
import { emparejarProveedor, emparejarRenglones, palabras, puntaje } from "@/components/admin/compra/emparejar-factura";
import { faltaParaOrden } from "@/components/admin/compra/use-confirmar-compra";
import type { PurchaseProduct } from "@/lib/types/purchases";

const prod = (id: number, name: string, extra: Partial<PurchaseProduct> = {}): PurchaseProduct => ({
  id, name, category: "Abarrotes", price: 10, image: "", unit: "und", ...extra,
});

describe("costo de compra", () => {
  const sinCosto = prod(1, "Azúcar rubia 1kg", { price: 4.5, costPrice: null });
  const conCosto = prod(2, "Aceite Primor 1L", { price: 12, costPrice: 9.8 });
  const costoCero = prod(3, "Fideo Don Vittorio", { price: 3, costPrice: 0 });

  it("sin costo cargado ni compras: null, nunca el precio de venta", () => {
    expect(costoSugerido(sinCosto, {})).toBeNull();
    expect(costoSugerido(costoCero, {})).toBeNull();
  });

  it("prefiere el último costo pagado al costo del producto", () => {
    expect(costoSugerido(conCosto, { 2: 10.4 })).toBe(10.4);
    expect(costoSugerido(conCosto, {})).toBe(9.8);
  });

  it("lo escrito manda; borrado (null) = falta aunque haya sugerido", () => {
    expect(costoDe({ product: conCosto, quantity: 1, unitCost: 11 }, {})).toBe(11);
    expect(costoDe({ product: conCosto, quantity: 1, unitCost: null }, {})).toBeNull();
    expect(costoDe({ product: conCosto, quantity: 1 }, {})).toBe(9.8);
  });

  it("lista lo que falta y el PDF recibe el costo efectivo, no el de venta", () => {
    const cart = [{ product: sinCosto, quantity: 2 }, { product: conCosto, quantity: 1 }];
    expect(itemsSinCosto(cart, {}).map((i) => i.product.id)).toEqual([1]);
    expect(conCostoEfectivo(cart, {}).map((i) => i.product.costPrice)).toEqual([0, 9.8]);
  });

  it("historial: la primera orden (más nueva) gana y los ceros no cuentan", () => {
    const h = historialDesdeOrdenes([
      { items: [{ productId: 2, unitCost: 10.4 }, { productId: 3, unitCost: 0 }] },
      { items: [{ productId: 2, unitCost: 9 }, { productId: 3, unitCost: 2.1 }] },
    ]);
    expect(h).toEqual({ 2: 10.4, 3: 2.1 });
  });

  it("tras crear la orden, lo que acabas de pagar pasa a ser el último costo (los ceros no pisan)", () => {
    const antes = { 2: 10.4, 3: 2.1 };
    const h = historialConCompra(antes, [{ productId: 2, unitCost: 11.2 }, { productId: 3, unitCost: 0 }, { productId: 7, unitCost: 4.5 }]);
    expect(h).toEqual({ 2: 11.2, 3: 2.1, 7: 4.5 });
    expect(antes).toEqual({ 2: 10.4, 3: 2.1 });
  });

  it("la orden no sale sin proveedor, sin costo o con comprobante sin número", () => {
    const base = { selectedSupplier: { id: "s1", name: "Dist. ABC" }, invoiceType: "ninguno" as const, invoiceNumber: "" };
    const cart = [{ product: sinCosto, quantity: 1 }];
    expect(faltaParaOrden({ ...base, cart, sinCosto: cart })).toMatch(/Falta el costo de Azúcar/);
    expect(faltaParaOrden({ ...base, selectedSupplier: null, cart, sinCosto: [] })).toMatch(/proveedor/);
    expect(faltaParaOrden({ ...base, invoiceType: "factura", cart, sinCosto: [] })).toMatch(/número del comprobante/);
    expect(faltaParaOrden({ ...base, invoiceType: "factura", invoiceNumber: "F001-1", cart, sinCosto: [] })).toBeNull();
  });
});

describe("emparejar la factura", () => {
  const catalogo = [
    prod(10, "Arroz Costeño 5kg"),
    prod(11, "Arroz Costeño 1kg"),
    prod(12, "Arroz Paisana 5kg"),
    prod(13, "Aceite Primor 1L"),
  ];

  it("separa números de unidades y quita tildes y palabras vacías", () => {
    expect(palabras("ARROZ COSTEÑO X 5KG")).toEqual(["arroz", "costeno", "5", "kg"]);
  });

  it("elige el de mejor puntaje, no el primero que contiene el texto", () => {
    const { encontrados } = emparejarRenglones([{ nombre: "ARROZ COSTEÑO X 5KG", cantidad: 3, precioUnitario: 21.5 }], catalogo);
    expect(encontrados.map((e) => e.producto.id)).toEqual([10]);
    expect(puntaje("ARROZ COSTEÑO X 5KG", "Arroz Costeño 5kg")).toBe(1);
  });

  it("«Arroz» a secas es ambiguo: va a no encontrados con sugerencias", () => {
    const { encontrados, pendientes } = emparejarRenglones([{ nombre: "Arroz", cantidad: 1, precioUnitario: 4 }], catalogo);
    expect(encontrados).toHaveLength(0);
    expect(pendientes[0].sugeridos.length).toBeGreaterThanOrEqual(3);
  });

  it("lo que no se parece a nada no se pierde: queda pendiente sin sugerencias", () => {
    const { pendientes } = emparejarRenglones([{ nombre: "Detergente Ariel 900g", cantidad: 2, precioUnitario: 9 }], catalogo);
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].sugeridos).toHaveLength(0);
  });

  it("proveedor por RUC antes que por nombre", () => {
    const proveedores = [
      { id: "a", name: "Distribuidora Ucayali", ruc: "20123456789" },
      { id: "b", name: "Comercial Selva", ruc: "20999999999" },
    ];
    expect(emparejarProveedor({ nombre: "DISTRIB. XYZ S.A.C.", ruc: "20999999999" }, proveedores)?.id).toBe("b");
    expect(emparejarProveedor({ nombre: "Distribuidora Ucayali SAC" }, proveedores)?.id).toBe("a");
    expect(emparejarProveedor({ nombre: "Otro" }, proveedores)).toBeNull();
  });
});
