/**
 * Formatos 8.1 y 13.1 de trabajo + piezas comunes (período, tablas, TXT).
 * Puro: sin base ni red.
 */
import { describe, expect, it } from "vitest";
import { armarRegistroCompras, type CompraRecibida, type GastoDelMes } from "@/lib/contabilidad/libros/registro-compras";
import { armarKardexValorizado, unidadTabla6, type MovimientoKardex } from "@/lib/contabilidad/libros/kardex-valorizado";
import { libroATxt, partirSerieNumero, rangoDelPeriodo, tipoDocIdentidad } from "@/lib/contabilidad/libros/comun";

const d = (iso: string) => new Date(iso);

const compra = (p: Partial<CompraRecibida> = {}): CompraRecibida => ({
  id: "po1",
  fechaSistema: d("2026-08-05T16:00:00Z"),
  proveedorNombre: "Distribuidora Ucayali",
  proveedorDoc: "20600011122",
  proveedorTipoDoc: "RUC",
  tipoComprobante: "factura",
  numeroComprobante: "F001-00045",
  total: 236,
  estado: "recibido",
  ...p,
});

const gasto = (p: Partial<GastoDelMes> = {}): GastoDelMes => ({
  id: "g1",
  fecha: d("2026-08-03T00:00:00Z"),
  categoria: "servicios",
  descripcion: "Luz",
  proveedorNombre: "Electro Ucayali",
  proveedorDoc: "20100000001",
  tipoDocumento: "factura",
  numeroDocumento: "E001-77",
  monto: 118,
  igv: 18,
  ...p,
});

describe("registro de compras 8.1 de trabajo", () => {
  it("compra recibida con factura: serie y número partidos, importe total, base e IGV vacíos, sin fecha de emisión", () => {
    const libro = armarRegistroCompras({ periodo: "2026-08", compras: [compra()], gastos: [] });
    expect(libro.filas[0]).toMatchObject({
      fechaEmision: null,
      fechaSistema: "05/08/2026",
      tipo: "01",
      serie: "F001",
      numero: "45",
      provTipoDoc: "6",
      bi1: null,
      igv1: null,
      total: 236,
    });
  });

  it("gasto con IGV anotado: base = monto − IGV en las columnas 11 y 12; el día es el guardado (UTC)", () => {
    const libro = armarRegistroCompras({ periodo: "2026-08", compras: [], gastos: [gasto()] });
    expect(libro.filas[0]).toMatchObject({ bi1: 100, igv1: 18, total: 118, fechaSistema: "03/08/2026", origen: "Gasto" });
    expect(libro.totales).toMatchObject({ bi1: 100, igv1: 18, total: 118 });
  });

  it("sin comprobante (guía, ninguno, sin_comprobante o vacío) no entra y se cuenta en Notas", () => {
    const libro = armarRegistroCompras({
      periodo: "2026-08",
      compras: [compra({ id: "g", tipoComprobante: "guia", numeroComprobante: "T001-9" }), compra({ id: "n", tipoComprobante: null, numeroComprobante: null })],
      gastos: [gasto({ id: "s", tipoDocumento: "sin_comprobante" }), gasto({ id: "v", tipoDocumento: null, numeroDocumento: null, monto: 930 })],
    });
    expect(libro.filas).toHaveLength(0);
    expect(libro.notas.join(" ")).toContain("2 compras recibidas sin comprobante");
    expect(libro.notas.join(" ")).toContain("2 gastos sin comprobante no entran: suman S/ 1,048.00");
  });

  it("compra recibida en parte: no entra (entra al completarse) y la nota lleva N y S/", () => {
    const libro = armarRegistroCompras({ periodo: "2026-08", compras: [compra(), compra({ id: "po2", estado: "parcial", total: 1500.5 })], gastos: [] });
    expect(libro.filas.map((f) => f.idSistema)).toEqual(["po1"]);
    expect(libro.totales.total).toBe(236);
    expect(libro.notas.join(" ")).toContain("1 compras recibidas en parte (S/ 1,500.50, el total de la orden) todavía no entran");
  });

  it("gasto con hora: el día es el de Lima, igual que el IGV del mes (30-sep 21:00 = setiembre)", () => {
    const libro = armarRegistroCompras({ periodo: "2026-09", compras: [], gastos: [gasto({ fecha: d("2026-10-01T02:00:00Z") })] });
    expect(libro.filas[0].fechaSistema).toBe("30/09/2026");
  });

  it("ticket y recibo no se pasan a la Tabla 10 (pueden ser varios tipos): el tipo anotado va al final", () => {
    const libro = armarRegistroCompras({ periodo: "2026-08", compras: [], gastos: [gasto({ tipoDocumento: "ticket", igv: null })] });
    expect(libro.filas[0]).toMatchObject({ tipo: null, tipoSistema: "ticket", bi1: null, igv1: null, total: 118 });
  });
});

describe("kardex valorizado 13.1 de trabajo", () => {
  const mov = (p: Partial<MovimientoKardex>): MovimientoKardex => ({
    id: "m",
    productoId: 1,
    tipo: "venta",
    cantidad: 1,
    stockAntes: 10,
    stockDespues: 9,
    referencia: "sale-1",
    fecha: d("2026-08-10T15:00:00Z"),
    almacen: null,
    costoUnitario: null,
    costoConIgv: null,
    ...p,
  });

  it("saldo inicial (16) con el stock previo, compra con costo, venta sin costo vacía, saldo en cantidad", () => {
    const libro = armarKardexValorizado({
      periodo: "2026-08",
      recortado: false,
      productos: [{ id: 1, nombre: "Arroz Costeño 5kg", codigo: null, unidad: "unidad" }],
      movimientos: [
        mov({ id: "v", tipo: "venta", cantidad: 1, stockAntes: 13, stockDespues: 12, fecha: d("2026-08-12T15:00:00Z") }),
        mov({ id: "c", tipo: "compra", cantidad: 3, stockAntes: 10, stockDespues: 13, referencia: "OC-po1", costoUnitario: 2.5, costoConIgv: true, fecha: d("2026-08-11T15:00:00Z") }),
      ],
    });
    expect(libro.filas.map((f) => [f.operacion, f.entCant, f.salCant, f.saldoCant])).toEqual([
      ["16", 10, null, 10],
      ["02", 3, null, 13],
      ["01", null, 1, 12],
    ]);
    expect(libro.filas[1]).toMatchObject({ entCu: 2.5, entCosto: 7.5, costoConIgv: "sí", codigo: "1", unidad: "07" });
    expect(libro.filas[2]).toMatchObject({ salCu: null, salCosto: null, saldoCu: null, saldoCosto: null });
    expect(libro.totales).toEqual({ entCosto: 7.5, salCosto: 0 });
  });

  it("un movimiento que no arranca del saldo anterior se cuenta en Notas (no se corrige)", () => {
    const libro = armarKardexValorizado({
      periodo: "2026-10",
      recortado: false,
      productos: [{ id: 1, nombre: "Aceite", codigo: "SKU-1", unidad: "lt" }],
      movimientos: [
        mov({ id: "a", tipo: "venta_online", stockAntes: 55, stockDespues: 54, fecha: d("2026-10-01T15:00:00Z") }),
        mov({ id: "b", tipo: "ajuste_positivo", stockAntes: 55, stockDespues: 56, fecha: d("2026-10-02T15:00:00Z") }),
      ],
    });
    expect(libro.filas.map((f) => f.saldoCant)).toEqual([55, 54, 56]);
    expect(libro.notas.some((n) => n.startsWith("1 movimientos empiezan con un stock distinto"))).toBe(true);
  });

  it("unidad del sistema → Tabla 6 (2006); lo que no calza, vacío", () => {
    expect([unidadTabla6("kg"), unidadTabla6("Unidad"), unidadTabla6("m³"), unidadTabla6("docena")]).toEqual(["01", "07", "14", null]);
  });
});

describe("piezas comunes", () => {
  it("período de Lima: diciembre pasa al año siguiente; basura = null", () => {
    const r = rangoDelPeriodo("2026-12");
    expect(r?.desde.toISOString()).toBe("2026-12-01T05:00:00.000Z");
    expect(r?.hasta.toISOString()).toBe("2027-01-01T05:00:00.000Z");
    expect(r?.hastaDia.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(rangoDelPeriodo("2026-13")).toBeNull();
    expect(rangoDelPeriodo("2026-1")).toBeNull();
  });

  it("documento de identidad y serie-número: lo que no calza no se adivina", () => {
    expect([tipoDocIdentidad("20123456789"), tipoDocIdentidad("4567891"), tipoDocIdentidad("X1", "PASAPORTE")]).toEqual(["6", null, "7"]);
    expect(partirSerieNumero("Factura 45")).toEqual({ serie: null, numero: "Factura 45" });
  });

  it("TXT de trabajo: aviso arriba, encabezado numerado, `|` del texto saneado, montos con 2 decimales", () => {
    const libro = armarRegistroCompras({ periodo: "2026-08", compras: [], gastos: [gasto({ descripcion: "Luz | agosto" })] });
    const lineas = libroATxt(libro).split("\r\n");
    expect(lineas[0]).toMatch(/^# 8\.1 Registro de Compras — período 2026-08 — Documento de trabajo/);
    expect(lineas[1].startsWith("1. Número correlativo")).toBe(true);
    const celdas = lineas[2].split("|");
    expect(celdas).toHaveLength(libro.columnas.length);
    expect(celdas[libro.columnas.findIndex((c) => c.clave === "bi1")]).toBe("100.00");
    expect(celdas[libro.columnas.findIndex((c) => c.clave === "detalle")]).toBe("servicios · Luz agosto");
  });
});
