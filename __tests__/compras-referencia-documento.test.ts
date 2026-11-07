import { describe, expect, it } from "vitest";
import {
  armarDescripcion, claveDe, claveDocumento, codigoDeOrden, coincideBusqueda, descripcionALaVista, revisarAlta,
  type CuentaComparable, type DatosDeOrigen,
} from "@/lib/compras/referencia-documento";

const datos = (p: Partial<DatosDeOrigen>): DatosDeOrigen => ({
  origen: "documento", tipo: "factura", serie: "", numero: "", emitida: "", ordenId: "", nota: "", ...p,
});
const cuenta = (p: Partial<CuentaComparable>): CuentaComparable => ({
  id: "c1", supplierId: "s1", description: "", amount: 100, paidAmount: 0, status: "pendiente", ...p,
});

describe("clave del documento (C42)", () => {
  it("las variantes del mismo número dan la misma clave", () => {
    for (const t of ["F001-123", "F1-123", "f001 - 00000123", "Factura F001-0000123 de octubre", "F001 123", "F001-N° 123"]) {
      expect(claveDocumento(t), t).toBe("F001-123");
    }
    expect(claveDocumento("FF01-9")).toBe("FF01-9");
    expect(claveDocumento("0001-45")).toBe("0001-45");
  });

  it("una fecha, un monto o un número cero no son un documento", () => {
    expect(claveDocumento("2026-10-15")).toBeNull();
    expect(claveDocumento("Arroz 50 kg")).toBeNull();
    expect(claveDocumento("F001-000")).toBeNull();
    expect(claveDocumento("")).toBeNull();
  });

  it("serie y número de los campos de la ventana", () => {
    expect(claveDe("F1", "0000123")).toBe("F001-123");
    expect(claveDe(" b001 ", "7")).toBe("B001-7");
    expect(claveDe("1", "45")).toBe("0001-45");
    expect(claveDe("F001", "")).toBeNull();
    expect(claveDe("", "12")).toBeNull();
    expect(claveDe("FACT", "12")).toBeNull();
  });
});

describe("descripción con forma fija (C41)", () => {
  it("factura con emisión y nota", () => {
    expect(armarDescripcion(datos({ serie: "f1", numero: "00123", emitida: "2026-10-09", nota: " arroz  y azúcar " })))
      .toEqual({ texto: "Factura F001-123 · emitida viernes 09/10 · arroz y azúcar" });
  });

  it("orden con el comprobante que ya trae", () => {
    expect(armarDescripcion(datos({ origen: "orden", ordenId: "po-1760000000000-ab12cd34", ordenDocumento: "Factura F001-9" })))
      .toEqual({ texto: "Orden de compra #AB12CD34 · Factura F001-9" });
  });

  it("saldo inicial y otro motivo piden el motivo", () => {
    expect(armarDescripcion(datos({ origen: "saldo-inicial", nota: "lo que debía al 01/10" }))).toEqual({ texto: "Saldo inicial · lo que debía al 01/10" });
    expect(armarDescripcion(datos({ origen: "otro", nota: "flete" }))).toEqual({ texto: "flete" });
    expect(armarDescripcion(datos({ origen: "saldo-inicial" }))).toHaveProperty("error");
    expect(armarDescripcion(datos({ origen: "orden" }))).toHaveProperty("error");
    expect(armarDescripcion(datos({ serie: "F001" }))).toHaveProperty("error");
  });

  it("a la vista, la cuenta de una OC no muestra el id técnico", () => {
    expect(codigoDeOrden("po-1760000000000-ab12cd34")).toBe("#AB12CD34");
    expect(descripcionALaVista("Auto-generado desde OC po-1760000000000-ab12cd34")).toBe("Orden de compra #AB12CD34");
    expect(descripcionALaVista("Auto-generado desde OC po-1760000000000-ab12cd34 · faltaron 2 sacos")).toBe("Orden de compra #AB12CD34 · faltaron 2 sacos");
    expect(descripcionALaVista("", "po-1-zz99yy88")).toBe("Orden de compra #ZZ99YY88");
    expect(descripcionALaVista("Factura F001-1")).toBe("Factura F001-1");
  });
});

describe("repetir el documento no crea otra deuda (C41)", () => {
  const existentes = [
    cuenta({ id: "a", description: "Factura F001-00000123 · arroz", amount: 350, paidAmount: 350, status: "pagado" }),
    cuenta({ id: "b", description: "Orden de compra #X", amount: 200, purchaseOrderId: "po-9", documentoDeLaOrden: "F002-77" }),
    cuenta({ id: "c", description: "flete", amount: 80 }),
    cuenta({ id: "otro", supplierId: "s2", description: "Factura F001-555", amount: 80 }),
  ];

  it("la misma factura con el mismo proveedor, aunque ya esté pagada", () => {
    const r = revisarAlta({ supplierId: "s1", description: "Factura F1-123", amount: 10 }, existentes);
    expect(r.mismoDocumento?.id).toBe("a");
  });

  it("el comprobante que vino en la orden también cuenta", () => {
    expect(revisarAlta({ supplierId: "s1", description: "Factura F002-0077", amount: 10 }, existentes).mismoDocumento?.id).toBe("b");
  });

  it("el mismo número con OTRO proveedor no es duplicado", () => {
    expect(revisarAlta({ supplierId: "s1", description: "Factura F001-555", amount: 10 }, existentes).mismoDocumento).toBeNull();
  });

  it("la misma orden, sea del proveedor que sea", () => {
    expect(revisarAlta({ supplierId: "s2", description: "", amount: 10, purchaseOrderId: "po-9" }, existentes).mismaOrden?.id).toBe("b");
  });

  it("el mismo importe sólo avisa, y sólo entre las que faltan pagar", () => {
    const r = revisarAlta({ supplierId: "s1", description: "otra cosa", amount: 80.004 }, existentes);
    expect(r.mismoDocumento).toBeNull();
    expect(r.mismoImporte.map((c) => c.id)).toEqual(["c"]);
    expect(revisarAlta({ supplierId: "s1", description: "", amount: 350 }, existentes).mismoImporte).toEqual([]);
  });
});

describe("buscador de Por pagar (C42)", () => {
  const c = { supplierName: "Distribuidora Ucayali", description: "Factura F001-00000123 · arroz", amount: 350, paidAmount: 100 };

  it("por proveedor o texto, sin acentos", () => {
    expect(coincideBusqueda(c, "ucayali")).toBe(true);
    expect(coincideBusqueda(c, "ARROZ")).toBe(true);
    expect(coincideBusqueda({ ...c, supplierName: "Comercial Peña" }, "pena")).toBe(true);
  });

  it("por el documento escrito de otra forma", () => {
    expect(coincideBusqueda(c, "F1-123")).toBe(true);
    expect(coincideBusqueda(c, "f001 123")).toBe(true);
    expect(coincideBusqueda(c, "F1-124")).toBe(false);
  });

  it("por importe exacto, total o lo que falta", () => {
    expect(coincideBusqueda(c, "350")).toBe(true);
    expect(coincideBusqueda(c, "S/ 250")).toBe(true);
    expect(coincideBusqueda(c, "35")).toBe(false);
  });

  it("la orden se busca por su código, no por el id", () => {
    const oc = { ...c, description: "Auto-generado desde OC po-1760000000000-ab12cd34" };
    expect(coincideBusqueda(oc, "#ab12")).toBe(true);
    expect(coincideBusqueda(oc, "po-176")).toBe(false);
  });
});
