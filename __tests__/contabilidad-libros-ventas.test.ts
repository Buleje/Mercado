/**
 * Formato 14.1 de trabajo: de las ventas, pedidos, comprobantes y notas del mes
 * a las filas del registro. Puro: sin base ni red.
 */
import { describe, expect, it } from "vitest";
import {
  armarRegistroVentas,
  desglosarVenta,
  montosDeComprobante,
  type ComprobanteEmitido,
  type EntradaRegistroVentas,
  type VentaPos,
} from "@/lib/contabilidad/libros/registro-ventas";

const d = (iso: string) => new Date(iso);

const venta = (p: Partial<VentaPos> = {}): VentaPos => ({
  id: "v1",
  fecha: d("2026-08-12T15:00:00Z"),
  total: 118,
  comprobanteTipo: "ticket",
  comprobanteNumero: null,
  comprobanteDoc: null,
  clienteNombre: null,
  clienteDoc: null,
  clienteTipoDoc: null,
  lineas: [{ nombre: "Arroz", cantidad: 2, precio: 59, taxType: "gravado" }],
  ...p,
});

const comprobante = (p: Partial<ComprobanteEmitido> = {}): ComprobanteEmitido => ({
  id: "c1",
  tipo: "factura",
  serie: "F001",
  numero: 45,
  clienteDoc: "20123456789",
  clienteNombre: "Bodega SAC",
  subtotal: 100,
  igv: 18,
  total: 118,
  estado: "accepted",
  emitidoEn: d("2026-08-10T15:00:00Z"),
  pedidoId: null,
  ...p,
});

const entrada = (p: Partial<EntradaRegistroVentas> = {}): EntradaRegistroVentas => ({
  periodo: "2026-08",
  comprobantes: [],
  ventasPos: [],
  pedidos: [],
  notasCredito: [],
  pedidosSinEntregar: 0,
  pedidosConComprobante: [],
  devoluciones: [],
  ...p,
});

describe("registro de ventas 14.1 de trabajo", () => {
  it("venta del POS gravada: base e IGV con la regla de la boleta, sin tipo ni serie (ticket interno)", () => {
    const libro = armarRegistroVentas(entrada({ ventasPos: [venta()] }));
    const f = libro.filas[0];
    expect(f).toMatchObject({ correlativo: "1", fechaEmision: "12/08/2026", tipo: null, serie: null, numero: null, baseGravada: 100, igv: 18, total: 118, origen: "Venta POS" });
    expect(libro.totales.total).toBe(118);
    expect(libro.notas.some((n) => n.includes("1 ventas del POS salen sin tipo"))).toBe(true);
  });

  it("producto exonerado va a la columna 12, sin IGV", () => {
    const m = desglosarVenta([{ nombre: "Plátano", cantidad: 1, precio: 5, taxType: "exonerado" }], 5);
    expect(m).toMatchObject({ baseGravada: null, exonerada: 5, igv: 0, total: 5 });
  });

  it("venta sin líneas (venta libre): no se adivina la afectación, va «sin desglose»", () => {
    expect(desglosarVenta([], 30)).toEqual({ total: 30, sinDesglose: 30 });
  });

  it("venta con boleta numerada: tipo 03, serie y número partidos, DNI del cliente", () => {
    const libro = armarRegistroVentas(
      entrada({ ventasPos: [venta({ comprobanteTipo: "boleta", comprobanteNumero: "B001-000123", comprobanteDoc: "45678912" })] }),
    );
    expect(libro.filas[0]).toMatchObject({ tipo: "03", serie: "B001", numero: "123", clienteTipoDoc: "1", clienteDoc: "45678912" });
  });

  it("comprobante electrónico: tipo 01, RUC = tabla 2 «6», base = subtotal cuando el IGV es el 18 %", () => {
    const libro = armarRegistroVentas(entrada({ comprobantes: [comprobante()] }));
    expect(libro.filas[0]).toMatchObject({ tipo: "01", serie: "F001", numero: "45", clienteTipoDoc: "6", baseGravada: 100, igv: 18, total: 118, estado: "aceptado por SUNAT" });
  });

  it("comprobante con valor mixto: el IGV y el total guardados, el valor sin desglosar", () => {
    expect(montosDeComprobante({ subtotal: 110, igv: 18, total: 128 })).toEqual({ igv: 18, total: 128, sinDesglose: 110 });
  });

  it("nota de crédito electrónica: tipo 07 y en negativo", () => {
    const libro = armarRegistroVentas(entrada({ comprobantes: [comprobante({ tipo: "nota_credito", serie: "FC01", numero: 3 })] }));
    expect(libro.filas[0]).toMatchObject({ tipo: "07", serie: "FC01", baseGravada: -100, igv: -18, total: -118 });
  });

  it("anulado en cero, rechazado y baja fuera", () => {
    const libro = armarRegistroVentas(
      entrada({
        comprobantes: [
          comprobante({ id: "a", estado: "voided" }),
          comprobante({ id: "r", estado: "rejected", numero: 46 }),
          comprobante({ id: "b", tipo: "baja", numero: 47 }),
        ],
      }),
    );
    expect(libro.filas).toHaveLength(1);
    expect(libro.filas[0]).toMatchObject({ idSistema: "a", total: 0, igv: 0, estado: "anulado" });
    expect(libro.notas.some((n) => n.includes("1 comprobantes rechazados"))).toBe(true);
  });

  it("el pedido con comprobante no se repite; el entregado sin comprobante sí entra", () => {
    const libro = armarRegistroVentas(
      entrada({
        comprobantes: [comprobante({ pedidoId: "p1", tipo: "boleta", serie: "B001", clienteDoc: null })],
        pedidos: [
          { id: "p1", fecha: d("2026-08-10T15:00:00Z"), total: 118, clienteNombre: "Ana", clienteDoc: null, clienteTipoDoc: null, lineas: [] },
          { id: "p2", fecha: d("2026-08-11T15:00:00Z"), total: 59, clienteNombre: "Luis", clienteDoc: "45678912", clienteTipoDoc: "DNI", lineas: [{ nombre: "Arroz", cantidad: 1, precio: 59, taxType: null }] },
        ],
      }),
    );
    expect(libro.filas.map((f) => f.idSistema)).toEqual(["c1", "p2"]);
    expect(libro.filas[1]).toMatchObject({ origen: "Pedido online entregado", clienteTipoDoc: "1", baseGravada: 50, igv: 9, total: 59 });
    expect(libro.totales.total).toBe(177);
  });

  it("devolución sin nota de crédito: la venta sigue entera y la nota lo dice con N y S/", () => {
    const libro = armarRegistroVentas(
      entrada({
        ventasPos: [venta({ total: 0.1, lineas: [] })],
        devoluciones: [
          { id: "r1", origen: "pos", total: 24.9, conNotaCredito: false },
          { id: "r2", origen: "pos", total: 0.2, conNotaCredito: false },
          { id: "r3", origen: "pos", total: 50, conNotaCredito: true },
          { id: "r4", origen: "pedido", total: 12, conNotaCredito: false },
        ],
      }),
    );
    expect(libro.totales.total).toBe(0.1);
    const notas = libro.notas.join("\n");
    expect(notas).toContain("2 devoluciones del POS por S/ 25.10 no tienen nota de crédito: la venta sigue entera");
    expect(notas).toContain("1 devoluciones de pedidos por S/ 12.00 no tienen nota de crédito");
  });

  it("devolución con nota de crédito: sin aviso (la nota ya resta)", () => {
    const libro = armarRegistroVentas(entrada({ devoluciones: [{ id: "r3", origen: "pos", total: 50, conNotaCredito: true }] }));
    expect(libro.notas.join(" ")).not.toContain("devoluciones");
  });

  it("pedido con boleta emitida en otro mes: no entra como pedido (entra con la boleta en ese mes)", () => {
    const pedido = { id: "p9", fecha: d("2026-08-31T20:00:00Z"), total: 59, clienteNombre: "Ana", clienteDoc: null, clienteTipoDoc: null, lineas: [] };
    const libro = armarRegistroVentas(entrada({ pedidos: [pedido], pedidosConComprobante: ["p9"], pedidosSinEntregar: 2 }));
    expect(libro.filas).toHaveLength(0);
    const notas = libro.notas.join(" ");
    expect(notas).toContain("1 pedidos entregados de este mes tienen su boleta o factura emitida en otro mes");
    expect(notas).toContain("Cuando se entreguen entran en ESTE mes");
  });

  it("nota de crédito interna: la base se resta en céntimos (4,70 − 0,72 = 3,98 exacto)", () => {
    const libro = armarRegistroVentas(
      entrada({ notasCredito: [{ id: "nc2", numero: "NC-0002", fecha: d("2026-08-20T15:00:00Z"), igv: 0.72, total: 4.7, motivo: "x", referencia: null }] }),
    );
    expect(libro.filas[0].baseGravada).toBe(-3.98);
  });

  it("nota de crédito interna en negativo y con la referencia de la venta", () => {
    const libro = armarRegistroVentas(
      entrada({
        ventasPos: [venta()],
        notasCredito: [
          {
            id: "nc1",
            numero: "NC-0001",
            fecha: d("2026-08-20T15:00:00Z"),
            igv: 1.8,
            total: 11.8,
            motivo: "Devolución",
            referencia: { fecha: d("2026-08-12T15:00:00Z"), tipo: "03", serie: "B001", numero: "123" },
          },
        ],
      }),
    );
    const nc = libro.filas[1];
    expect(nc).toMatchObject({ tipo: "07", numero: "NC-0001", baseGravada: -10, igv: -1.8, total: -11.8, refFecha: "12/08/2026", refTipo: "03", refSerie: "B001", refNumero: "123" });
    expect(libro.totales.total).toBe(106.2);
  });

  it("ordena por fecha y numera el correlativo; el día es el de Lima", () => {
    const libro = armarRegistroVentas(
      entrada({
        ventasPos: [
          venta({ id: "tarde", fecha: d("2026-09-01T03:30:00Z") }), // 31-08 22:30 en Lima
          venta({ id: "temprano", fecha: d("2026-08-01T05:30:00Z") }),
        ],
      }),
    );
    expect(libro.filas.map((f) => [f.correlativo, f.idSistema, f.fechaEmision])).toEqual([
      ["1", "temprano", "01/08/2026"],
      ["2", "tarde", "31/08/2026"],
    ]);
  });

  it("un nombre que Excel leería como fórmula sale como texto", () => {
    const libro = armarRegistroVentas(entrada({ ventasPos: [venta({ clienteNombre: "=HYPERLINK(\"x\")" })] }));
    expect(libro.filas[0].clienteNombre).toBe("'=HYPERLINK(\"x\")");
  });

  it("suma en céntimos: 0,10 + 0,20 = 0,30", () => {
    const libro = armarRegistroVentas(
      entrada({ ventasPos: [venta({ id: "a", total: 0.1, lineas: [] }), venta({ id: "b", total: 0.2, lineas: [] })] }),
    );
    expect(libro.totales.total).toBe(0.3);
  });
});
