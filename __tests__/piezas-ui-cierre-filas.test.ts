/**
 * Pieza `cierre-para-contador`: de lo que devuelven /api/sales y /api/expenses
 * a las filas del Excel. Ninguna cifra se calcula: cada celda es un dato guardado.
 */
import { describe, expect, it } from "vitest";
import { celdaSegura, filasDeGastos, filasDeVentas, nombreDelArchivo, rangoDelMes } from "@/extensiones/cierre-para-contador/filas";
import { opcionesCierreParaContador } from "@/extensiones/cierre-para-contador/manifest";

const ventas = [
  { id: 2, createdAt: "2026-09-20T15:30:00.000Z", total: 45.5, payment: "yape", comprobanteTipo: "factura", comprobanteRuc: "20123456789", cashierId: "=cmd" },
  { id: 1, createdAt: "2026-09-02T14:00:00.000Z", total: 10, payment: "efectivo" },
];

describe("filasDeVentas", () => {
  it("sale del más antiguo al más nuevo, con SÓLO las columnas pedidas y en ese orden", () => {
    const filas = filasDeVentas(ventas, ["fecha", "comprobante", "total"]);
    expect(filas).toEqual([
      { Fecha: "2026-09-02", Comprobante: "ticket", "Total (S/)": 10 },
      { Fecha: "2026-09-20", Comprobante: "factura", "Total (S/)": 45.5 },
    ]);
  });

  it("la fecha es la de Lima, no la de UTC (23:30 de Lima ya es el día siguiente en UTC)", () => {
    const [f] = filasDeVentas([{ id: 3, createdAt: "2026-09-30T04:30:00.000Z", total: 1 }], ["fecha", "hora"]);
    expect(f.Fecha).toBe("2026-09-29");
  });

  it("el total llega como número (el contador lo suma) y un dato ausente queda vacío, no 0", () => {
    const [f] = filasDeVentas([{ id: 4, createdAt: "2026-09-02T14:00:00.000Z" }], ["total", "descuento"]);
    expect(f).toEqual({ "Total (S/)": "", "Descuento (S/)": "" });
  });

  it("un cajero que empieza con = no se vuelve fórmula en Excel", () => {
    const filas = filasDeVentas(ventas, ["cajero"]);
    expect(filas.map((f) => f.Cajero)).toEqual(["", "'=cmd"]);
  });
});

describe("filasDeGastos", () => {
  it("usa el IGV registrado, no uno calculado", () => {
    const filas = filasDeGastos(
      [{ id: "g", date: "2026-09-10T12:00:00.000Z", category: "servicios", amount: 118, igvAmount: 18, supplierName: "Luz del Sur", documentType: "factura", documentNumber: "F001-23" }],
      ["fecha", "proveedor", "numeroDoc", "igv", "monto"],
    );
    expect(filas).toEqual([{ Fecha: "2026-09-10", Proveedor: "Luz del Sur", "N° de documento": "F001-23", "IGV (S/)": 18, "Monto (S/)": 118 }]);
  });
});

describe("rangoDelMes / nombreDelArchivo / celdaSegura", () => {
  it("rango de un mes de 30, uno de 31 y febrero bisiesto", () => {
    expect(rangoDelMes("2026-09")).toEqual({ desde: "2026-09-01", hasta: "2026-09-30" });
    expect(rangoDelMes("2026-12")).toEqual({ desde: "2026-12-01", hasta: "2026-12-31" });
    expect(rangoDelMes("2028-02")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" });
  });
  it("rechaza lo que no es un mes", () => {
    expect(rangoDelMes("2026-13")).toBeNull();
    expect(rangoDelMes("septiembre")).toBeNull();
    expect(rangoDelMes("")).toBeNull();
  });
  it("el archivo no lleva tildes, espacios ni símbolos", () => {
    expect(nombreDelArchivo("2026-09", "María Ñandú & Hnos.")).toBe("cierre-2026-09-maria-nandu-hnos");
    expect(nombreDelArchivo("2026-09", "")).toBe("cierre-2026-09");
  });
  it("celdaSegura sólo toca lo que Excel leería como fórmula", () => {
    expect(celdaSegura("=1+1")).toBe("'=1+1");
    expect(celdaSegura("Luz del Sur")).toBe("Luz del Sur");
  });
});

describe("opciones de la pieza", () => {
  it("`{}` ya es una configuración válida (se puede prender sin llenar nada)", () => {
    const r = opcionesCierreParaContador.safeParse({});
    expect(r.success).toBe(true);
    expect(r.success && r.data.columnasVentas).toContain("total");
  });
  it("rechaza un campo de más (nadie cuela un tenantId por las opciones) y una columna que no existe", () => {
    expect(opcionesCierreParaContador.safeParse({ tenantId: "x" }).success).toBe(false);
    expect(opcionesCierreParaContador.safeParse({ columnasVentas: ["inventada"] }).success).toBe(false);
    expect(opcionesCierreParaContador.safeParse({ columnasVentas: [] }).success).toBe(false);
  });
});
