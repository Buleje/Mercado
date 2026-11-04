import { describe, expect, it } from "vitest";
import {
  aCentimos,
  costoUnitarioDe,
  cuerpoDeLaCompra,
  leerTipoCambio,
  lineasSinProducto,
  tipoCambioTexto,
  type CambioUsado,
  type Elegidos,
} from "@/components/admin/compras/factura-xml/compra-desde-factura";
import type { FacturaXml, LineaFacturaXml } from "@/lib/compras/factura-xml";

function linea(numero: number, cantidad: number, total: number, extra: Partial<LineaFacturaXml> = {}): LineaFacturaXml {
  return {
    numero, descripcion: `Producto ${numero}`, cantidad, unidad: "NIU", total, gratuita: false,
    codigoVendedor: null, codigoBarras: null, ...extra,
  } as unknown as LineaFacturaXml;
}

function factura(moneda: string, lineas: LineaFacturaXml[]): FacturaXml {
  const total = Math.round(lineas.reduce((s, l) => s + l.total, 0) * 100) / 100;
  return {
    tipo: "factura", serieNumero: "F001-900", fecha: "2026-11-04", fechaVencimiento: null, moneda,
    emisor: { ruc: "20123456789", razonSocial: "Importadora SAC", nombreComercial: null },
    lineas, totales: { total, igv: 0, descuentos: 0 }, avisos: [],
  } as unknown as FacturaXml;
}

const prod = (id: number) => ({ id, nombre: `Mío ${id}`, unidad: "unidad", stock: null, costo: null, puntaje: 1 });
const SUNAT: CambioUsado = { venta: 3.752, fecha: "2026-11-04", fuente: "sunat", detalle: "SUNAT del 04-11" };
const base = { supplierId: "prov-1", supplierName: "Importadora SAC", formaDePago: "contado" as const };

/** Lo que hace el servidor (`POST /api/purchases`): Σ cantidad × costo por unidad. */
const sumaDelServidor = (items: Array<{ quantity: number; unitCost: number }>) => items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

describe("factura en dólares → compra en soles", () => {
  const usd = [linea(1, 7, 123.45), linea(2, 3, 10.01), linea(3, 13, 999.99)];
  const elegidos: Elegidos = { 1: prod(1), 2: prod(2), 3: prod(3) };

  it("en soles no cambia nada: costo = el de la factura, sin nota de tipo de cambio", () => {
    const f = factura("PEN", [linea(1, 4, 47.2), linea(2, 2, 10)]);
    const c = cuerpoDeLaCompra({ ...base, factura: f, elegidos: { 1: prod(1), 2: prod(2) }, cambio: SUNAT });
    expect(c.items.map((i) => i.unitCost)).toEqual(f.lineas.map(costoUnitarioDe));
    expect(c.notes).toBe("Cargada desde la factura electrónica (XML) F001-900");
  });

  it("3 líneas en US$: cada una cierra con su total × tipo de cambio a ±0,01 y la compra con el total convertido", () => {
    const f = factura("USD", usd);
    const c = cuerpoDeLaCompra({ ...base, factura: f, elegidos, cambio: SUNAT });
    c.items.forEach((item, i) => {
      const l = usd[i]!;
      expect(Math.abs(item.quantity * item.unitCost - l.total * SUNAT.venta)).toBeLessThanOrEqual(0.01);
      expect(item.unitCost).toBeGreaterThan(costoUnitarioDe(l) * 3);
    });
    const totalSoles = aCentimos(f.totales.total * SUNAT.venta);
    expect(Math.abs(sumaDelServidor(c.items) - totalSoles)).toBeLessThanOrEqual(0.01 * usd.length);
    expect(c.notes).toContain(`tipo de cambio SUNAT venta ${tipoCambioTexto(3.752)} del 04/11/2026`);
    expect(c.notes).toContain("Factura en US$");
  });

  it("tipo de cambio escrito a mano: se lee con coma o punto y la nota lo dice", () => {
    expect(leerTipoCambio("3,752")).toBe(3.752);
    expect(leerTipoCambio(" S/ 3.75 ")).toBe(3.75);
    expect(leerTipoCambio("37.52")).toBeNull();
    expect(leerTipoCambio("tres")).toBeNull();
    const manual: CambioUsado = { venta: 3.8, fecha: "2026-11-04", fuente: "manual", detalle: null };
    const c = cuerpoDeLaCompra({ ...base, factura: factura("USD", usd), elegidos, cambio: manual });
    expect(c.items[0]!.quantity * c.items[0]!.unitCost).toBeCloseTo(aCentimos(123.45 * 3.8), 4);
    expect(c.notes).toContain("escrito a mano");
  });

  it("sin tipo de cambio (o uno increíble) no deja armar la compra", () => {
    const f = factura("USD", usd);
    expect(() => cuerpoDeLaCompra({ ...base, factura: f, elegidos })).toThrow(/tipo de cambio/);
    expect(() => cuerpoDeLaCompra({ ...base, factura: f, elegidos, cambio: { ...SUNAT, venta: 37.52 } })).toThrow(/tipo de cambio/);
  });

  it("una línea quitada no va a la compra, no pide producto y queda en la nota", () => {
    const f = factura("USD", usd);
    expect(lineasSinProducto(f.lineas, { ...elegidos, 2: null }, [2])).toEqual([]);
    const c = cuerpoDeLaCompra({ ...base, factura: f, elegidos, cambio: SUNAT, quitadas: [2] });
    expect(c.items.map((i) => i.productId)).toEqual([1, 3]);
    expect(c.notes).toContain("Sin la línea 2 de la factura");
  });

  it("si el dato es del cierre SBS (BCRP), la nota lo dice", () => {
    const sbs: CambioUsado = { venta: 3.75, fecha: "2026-11-02", fuente: "bcrp-sbs", detalle: "SBS al cierre del 30-10 (BCRP)" };
    const c = cuerpoDeLaCompra({ ...base, factura: factura("USD", usd), elegidos, cambio: sbs });
    expect(c.notes).toContain("del 02/11/2026 (SBS al cierre del 30-10 (BCRP))");
  });
});
